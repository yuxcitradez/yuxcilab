"""WebSocket monitoring with closed-candle persistence. Deployment fails closed unless certified."""
from __future__ import annotations
import asyncio,json,threading
from datetime import datetime,timezone
import pandas as pd
import websockets
from .market import request
from .config import env
from .callback import AppClient
from .jobs import load_bars
from .sandbox import run_model
_lock=threading.Lock();_workers={}

def prepare(user_id,deployment_id):
    app=AppClient(user_id);data=app.call('live/context',{'deployment_id':deployment_id})
    report=data.get('validation') or {}
    if not report.get('deployable'): raise ValueError('Model requires all acceptance checks, including golden and DST fixtures, before live deployment')
    info=request('me')
    if not info.get('isSocketSupport'): raise ValueError('Your RealMarketAPI plan does not include WebSocket streaming')
    selected=data['instruments']
    if len(selected)>int(info.get('webSocketConcurrentLimit') or 0): raise ValueError('Selection exceeds your plan connection limit')
    if any(i['provider_symbol_code'] not in (info.get('symbols') or []) for i in selected): raise ValueError('An instrument is unavailable on your provider plan')
    if 'M1' not in (info.get('timeframes') or []): raise ValueError('Your plan does not support M1')
    return data

def start(user_id,deployment_id):
    data=prepare(user_id,deployment_id)
    with _lock:
        if deployment_id in _workers: return
        stop=threading.Event();pause=threading.Event();_workers[deployment_id]=(user_id,stop,pause)
    threading.Thread(target=lambda:asyncio.run(worker(user_id,deployment_id,data,stop,pause)),daemon=True).start()

def control(user_id,deployment_id,action):
    with _lock: entry=_workers.get(deployment_id)
    if not entry or entry[0]!=user_id: raise ValueError('Deployment worker is not active; create a new deployment')
    if action=='stop': entry[1].set()
    elif action=='pause': entry[2].set()
    elif action=='resume': entry[2].clear()
    else: raise ValueError('Invalid deployment action')

async def worker(user_id,deployment_id,data,stop,pause):
    app=AppClient(user_id)
    async def stream(instrument):
        symbol=instrument['provider_symbol_code'];backoff=1;previous=None;bars=[];seen=set();emitted=set()
        while not stop.is_set():
            url=f"wss://api.realmarketapi.com/price?apiKey={env('REALMARKETAPI_KEY')}&symbolCode={symbol}&timeFrame=M1"
            try:
                async with websockets.connect(url,ping_interval=20,ping_timeout=20,open_timeout=20) as socket:
                    backoff=1
                    app.call('live/event',{'deployment_id':deployment_id,'type':'feed_connected','message':f'{symbol} connected'})
                    while not stop.is_set():
                        try: raw=await asyncio.wait_for(socket.recv(),timeout=60)
                        except asyncio.TimeoutError:
                            app.call('live/event',{'deployment_id':deployment_id,'type':'feed_stale','level':'warning','message':f'{symbol}: no update for 60 seconds'})
                            continue
                        msg=json.loads(raw);ts=pd.Timestamp(msg.get('OpenTime') or msg.get('openTime'))
                        if ts.tzinfo is None: ts=ts.tz_localize('UTC')
                        ts=ts.tz_convert('UTC')
                        candle={'ts_utc':ts.isoformat(),'open':float(msg.get('OpenPrice',msg.get('openPrice'))),
                                'high':float(msg.get('HighPrice',msg.get('highPrice'))),'low':float(msg.get('LowPrice',msg.get('lowPrice'))),
                                'close':float(msg.get('ClosePrice',msg.get('closePrice'))),'volume':msg.get('Volume',msg.get('volume'))}
                        # A newer open time confirms the previous candle closed. Don't treat interim updates as closed.
                        if previous and ts>pd.Timestamp(previous['ts_utc']) and previous['ts_utc'] not in seen:
                            seen.add(previous['ts_utc']);bars.append(previous)
                            app.call('live/candle',{'deployment_id':deployment_id,'instrument_id':instrument['id'],'bar':previous})
                            if not pause.is_set():
                                output=run_model(data['version']['code'],bars,data['version']['params'],instrument)
                                for trade in output['trades']:
                                    key=(trade['entry_time'],trade['exit_time'])
                                    if key not in emitted:
                                        app.call('live/trade',{'deployment_id':deployment_id,'instrument_id':instrument['id'],'trade':trade});emitted.add(key)
                        if previous is None or ts>=pd.Timestamp(previous['ts_utc']): previous=candle
            except Exception:
                app.call('live/event',{'deployment_id':deployment_id,'type':'feed_reconnect','level':'warning','message':f'{symbol}: reconnecting; feed interrupted'})
                await asyncio.sleep(backoff);backoff=min(backoff*2,60)
    try: await asyncio.gather(*(stream(i) for i in data['instruments']))
    finally:
        with _lock: _workers.pop(deployment_id,None)

"""Shared closed-bar order processing for historical and paper execution."""
from __future__ import annotations
from types import SimpleNamespace
from zoneinfo import ZoneInfo
import math
import pandas as pd


def execute(module, frame: pd.DataFrame, params: dict, spec: dict) -> dict:
    if not callable(getattr(module, 'on_bar', None)):
        raise ValueError('Model must define META and on_bar(ctx, bar)')
    state, pending, position, trades, orders_log, events = {}, [], None, [], [], []
    last_bar = None
    def close(bar, price, reason):
        nonlocal position
        if position is None: return
        sign = 1 if position['side'] == 'long' else -1
        points = (price-position['entry'])*sign
        trades.append({**position, 'exit_time':bar.ts.isoformat(), 'exit':price,
                       'reason':reason, 'pts':points, 'pnl':points*position['qty']*spec.get('point_value',1),
                       'day':bar.ts.tz_convert(params.get('tz','America/New_York')).date().isoformat()})
        position = None
    for i, (ts, row) in enumerate(frame.iterrows()):
        bar=SimpleNamespace(ts=ts, **row.to_dict())
        spread=float(row.get('spread',0) or 0)*float(spec.get('point_size',.01)) if params.get('use_spread') else 0
        local=ts.tz_convert(params.get('tz','America/New_York'))
        if position and last_bar and position.get('flatten_local'):
            if last_bar.ts.tz_convert(params.get('tz','America/New_York')).date()!=local.date():
                close(last_bar,last_bar.close+(spread if position['side']=='short' else 0),'FLATTEN')
        eligible=[]
        for order in pending:
            if order.get('expire_utc') and ts > pd.Timestamp(order['expire_utc']): continue
            kind=order['type']; side=order.get('side'); price=order.get('price')
            triggered=kind in ('market','close','cancel_all')
            if kind=='stop': triggered=bar.high>price if side=='buy' else bar.low<price
            if kind=='limit': triggered=bar.low<price if side=='buy' else bar.high>price
            if triggered: eligible.append(order)
        ambiguous=set()
        for order in eligible:
            group=order.get('oco')
            legs=[o for o in eligible if group and o.get('oco')==group]
            if len(legs)>1 and all(o.get('price') is not None for o in legs):
                levels=[o['price'] for o in legs]
                if min(levels)<=bar.open<=max(levels):
                    ambiguous.add(group); events.append({'ts':ts.isoformat(),'type':'AMBIGUOUS','oco':group})
        consumed=[]
        at_open=False
        for order in eligible:
            if order.get('oco') in ambiguous: consumed.append(order); continue
            kind=order['type']
            if kind=='cancel_all': consumed.extend(pending); continue
            if kind=='close':
                if position: close(bar,bar.open+(spread if position['side']=='short' else 0),'MODEL_CLOSE')
                consumed.append(order); continue
            if position: continue
            side=order['side']; price=order.get('price',bar.open)
            beyond=(bar.open>price if side=='buy' else bar.open<price) if kind=='stop' else (bar.open<price if side=='buy' else bar.open>price)
            at_open=kind=='market' or beyond
            fill=bar.open if at_open else price
            entry=fill+(spread if side=='buy' else 0)
            qty=float(order.get('qty',params.get('qty',1)))
            dist=order.get('sl_dist')
            position={'side':'long' if side=='buy' else 'short','entry':entry,'entry_time':ts.isoformat(),
                      'sl':entry-dist if side=='buy' and dist else entry+dist if dist else None,
                      'tp':order.get('tp'),'qty':qty,'mae':0.,'mfe':0.,'tag':order.get('tag'),
                      'flatten_local':order.get('flatten_local'),'spread_at_entry':spread}
            consumed.append(order)
            if order.get('oco'): consumed.extend(o for o in pending if o.get('oco')==order['oco'])
        pending=[o for o in pending if o not in consumed and o.get('oco') not in ambiguous and (not o.get('expire_utc') or ts<=pd.Timestamp(o['expire_utc']))]
        if position:
            long=position['side']=='long'; sl=position['sl']; tp=position['tp']
            entry_bar=position['entry_time']==ts.isoformat()
            # Whole-bar excursion is unknown for an intrabar entry; don't fabricate an MAE.
            if not entry_bar or at_open:
                position['mae']=max(position['mae'],position['entry']-bar.low if long else bar.high+spread-position['entry'])
                position['mfe']=max(position['mfe'],bar.high-position['entry'] if long else position['entry']-bar.low-spread)
            stop=sl is not None and (bar.low<=sl if long else bar.high+spread>=sl)
            target=tp is not None and (not entry_bar or at_open) and (bar.high>=tp if long else bar.low+spread<=tp)
            if stop: close(bar,min(sl,bar.open) if long and not entry_bar else max(sl,bar.open+spread) if not long and not entry_bar else sl,'SL')
            elif target: close(bar,tp,'TP')
            elif position.get('flatten_local') and local.strftime('%H:%M')>=position['flatten_local']:
                close(bar,bar.close+(spread if not long else 0),'FLATTEN')
        ctx=SimpleNamespace(state=state,params=params,symbol=spec.get('symbol',''),spec=spec,
                            bars=frame.iloc[:i+1].copy(),position=dict(position) if position else None,
                            local_time=lambda tz, current=ts:current.tz_convert(tz))
        for column in ctx.bars.columns:
            try: ctx.bars[column].values.flags.writeable=False
            except ValueError: pass
        output=module.on_bar(ctx,bar)
        if not isinstance(output,list) or len(output)>100: raise ValueError('on_bar must return at most 100 orders')
        for order in output:
            if not isinstance(order,dict) or order.get('type') not in ('market','stop','limit','close','cancel_all'): raise ValueError('Invalid order type')
            if order['type'] in ('market','stop','limit') and order.get('side') not in ('buy','sell'): raise ValueError('Invalid order side')
            for key in ('price','tp','sl_dist','qty'):
                if key in order and (not isinstance(order[key],(int,float)) or not math.isfinite(order[key]) or order[key]<=0): raise ValueError(f'Invalid {key}')
            if order['type'] in ('stop','limit') and 'price' not in order: raise ValueError('Order price required')
            pending.append(dict(order)); orders_log.append({'ts':ts.isoformat(),**order})
        last_bar=bar
    return {'trades':trades,'orders':orders_log,'events':events,'open_position':position,'pending_orders':pending}

"""Account-aware RealMarketAPI access; credentials and request URLs never enter responses."""
import httpx
from .config import env
BASE='https://api.realmarketapi.com'
ALLOWED={'me','symbol','health','price','history','candle'}

def request(endpoint,params=None):
    if endpoint not in ALLOWED: raise ValueError('Unsupported provider endpoint')
    query=dict(params or {})
    if endpoint not in ('symbol','health'):
        key=env('REALMARKETAPI_KEY','')
        if not key: raise ValueError('Market-data API key is not configured')
        query['apiKey']=key
    try:
        response=httpx.get(f'{BASE}/api/v1/{endpoint}',params=query,timeout=15)
    except Exception: raise ValueError('Market-data provider is unreachable') from None
    if response.status_code>=400:
        messages={400:'Invalid market-data request',401:'Market-data API key rejected',403:'Symbol or feature unavailable on your plan',429:'Market-data request quota exceeded'}
        raise ValueError(messages.get(response.status_code,'Market-data provider error'))
    return response.json()

def account():
    return {'account':request('me'),'symbols':request('symbol')}

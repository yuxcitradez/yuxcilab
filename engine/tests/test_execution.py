from types import SimpleNamespace
import pandas as pd
from app.execution import execute
from app.orb_reference import Params,apply_pnl_rule
from app.prop import streak_dp,replay,simulate

def bars(rows):
 return pd.DataFrame(rows,columns=['open','high','low','close','spread'],index=pd.date_range('2026-06-01T10:00:00Z',periods=len(rows),freq='min'))
def strategy(order):
 return SimpleNamespace(on_bar=lambda ctx,bar:[order] if len(ctx.bars)==1 else [])
def test_orders_activate_next_bar():
 out=execute(strategy({'type':'market','side':'buy','sl_dist':20}),bars([(100,101,99,100,0),(105,106,104,105,0)]),{}, {})
 assert out['open_position']['entry']==105
 assert out['open_position']['entry_time']=='2026-06-01T10:01:00+00:00'
def test_strict_stop_does_not_fill_touch():
 out=execute(strategy({'type':'stop','side':'buy','price':110}),bars([(100,101,99,100,0),(105,110,104,108,0)]),{}, {})
 assert out['open_position'] is None
 assert len(out['pending_orders'])==1
def test_stop_wins_same_bar():
 out=execute(strategy({'type':'market','side':'buy','sl_dist':5,'tp':110}),bars([(100,101,99,100,0),(100,115,90,105,0)]),{}, {})
 assert out['trades'][0]['reason']=='SL'
 assert out['trades'][0]['exit']==95
def test_long_entry_pays_bid_spread():
 out=execute(strategy({'type':'market','side':'buy'}),bars([(100,101,99,100,10),(100,101,99,100,10)]),{'use_spread':True},{'point_size':.01})
 assert out['open_position']['entry']==100.1
def test_five_tp_pay_60_loss_minus19():
 result=apply_pnl_rule(pd.DataFrame({'status':['TP']*5+['TP','SL']}),Params())
 assert result.pnl.tolist()==[0,0,0,0,60,0,-19]
 assert result.cum_pnl.iloc[-1]==41
def test_exact_ruin_one_fee_no_wins():
 assert streak_dp(0,19,60,5,19,1)['ruin_probability']==1
def test_trailing_not_static():
 trades=[{'day':'2026-06-01','exit_time':'2026-06-01T16:00:00Z','pnl':100},{'day':'2026-06-02','exit_time':'2026-06-02T16:00:00Z','pnl':-75}]
 rules={'starting_balance':1000,'maximum_loss':50,'profit_target':1000,'maximum_loss_type':'static'}
 assert replay(trades,rules)['breach'] is None
 assert replay(trades,{**rules,'maximum_loss_type':'trailing'})['breach']=='maximum_loss'
def test_equity_requires_mae():
 import pytest
 with pytest.raises(ValueError,match='requires MAE'): replay([{'day':'2026-06-01','pnl':1}],{'loss_measurement':'equity'})
def test_break_even_19_60_five_days():
 out=simulate([{'day':'2026-06-01','reason':'TP','pnl':0}],{'account_fee':19,'payout_amount':60,'streak_length':5},19,1,samples=5)
 assert abs(out['break_even']-(19/79)**.2)<1e-12

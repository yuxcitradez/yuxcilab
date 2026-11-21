"""Account replay and seeded block-bootstrap bankroll estimates, not financial forecasts."""
from __future__ import annotations
import math
from collections import defaultdict
import numpy as np
from .orb_reference import wilson

def replay(trades, rules):
    start=float(rules.get('starting_balance',50000)); loss=float(rules.get('maximum_loss',2000))
    daily_limit=float(rules.get('daily_loss_limit',0)); target=float(rules.get('profit_target',3000))
    equity=start; peak=start; days=set(); daily=defaultdict(float); curve=[]; breach=None; passed=None
    daily_peak={}; best_day=0.; payouts=0.
    for t in sorted(trades,key=lambda t:t.get('exit_time') or t.get('day') or ''):
        # Daily reset uses the configured timezone and local reset clock, not UTC midnight.
        import pandas as pd
        ts=pd.Timestamp(t.get('exit_time') or t.get('day'))
        if ts.tzinfo is None: ts=ts.tz_localize('UTC')
        local=ts.tz_convert(rules.get('daily_reset_timezone','America/New_York'))
        hour,minute=map(int,rules.get('daily_reset_time','00:00').split(':'))
        day=(local-pd.Timedelta(hours=hour,minutes=minute)).date().isoformat()
        days.add(day);pnl=float(t.get('pnl') or 0);mae=float(t.get('mae') or 0)
        threshold=(peak if rules.get('maximum_loss_type')=='trailing' else start)-loss
        if rules.get('loss_measurement')=='equity' and t.get('mae') is None:
            raise ValueError('Equity-based replay requires MAE for every trade')
        worst=equity-mae*float(rules.get('point_value',1))*float(rules.get('fixed_lots',1)) if rules.get('loss_measurement')=='equity' else equity+pnl
        daily_peak.setdefault(day,equity)
        if worst<=threshold: breach='maximum_loss'
        if daily_limit>0 and worst<=daily_peak[day]-daily_limit: breach='daily_loss'
        equity+=pnl;daily[day]+=pnl;peak=max(peak,equity);best_day=max(best_day,daily[day])
        curve.append({'t':t.get('exit_time') or day,'v':equity,'drawdown':peak-equity})
        if breach: break
        consistency=float(rules.get('consistency_percent',100))/100
        if equity-start>=target and len(days)>=int(rules.get('minimum_trading_days',1)) and best_day<=max(equity-start,0)*consistency:
            passed=day; break
    return {'ending_balance':equity,'net_profit':equity-start,'passed':passed is not None,'passed_on':passed,
            'breach':breach,'trading_days':len(days),'max_drawdown':max((p['drawdown'] for p in curve),default=0),
            'curve':curve,'daily':dict(daily),'payouts':payouts}

def streak_dp(p,fee,payout,streak,bankroll,horizon):
    # Exact state probabilities; account fee paid at attempt start, payout resets the streak.
    states={(round(bankroll-fee,8),0):1.} if bankroll>=fee else {}
    ruin=0. if states else 1.;attempts=1. if states else 0.
    for _ in range(horizon):
        nxt=defaultdict(float)
        for (money,s),prob in states.items():
            win=s+1
            if win==streak:
                balance=round(money+payout-fee,8);attempts+=prob*p
                if balance<0: ruin+=prob*p
                else: nxt[(balance,0)]+=prob*p
            else: nxt[(money,win)]+=prob*p
            balance=round(money-fee,8);attempts+=prob*(1-p)
            if balance<0: ruin+=prob*(1-p)
            else: nxt[(balance,0)]+=prob*(1-p)
        states=dict(nxt)
        if len(states)>200000: raise ValueError('Exact simulation state limit exceeded; reduce horizon')
    return {'ruin_probability':min(1.,ruin),'expected_attempts':attempts}

def simulate(trades, rules, bankroll=190, horizon_days=120, samples=1000):
    if not trades: raise ValueError('Select a completed backtest with trades')
    fee=float(rules.get('account_fee',19));payout=float(rules.get('payout_amount',60));streak=int(rules.get('streak_length',5))
    if fee<=0 or payout<0 or streak<1 or bankroll<0 or not 1<=horizon_days<=365: raise ValueError('Invalid bankroll, fee, streak, payout or horizon')
    days=sorted({t.get('day') or str(t.get('entry_time'))[:10] for t in trades})
    wins=sum(t.get('reason')=='TP' for t in trades);p=wins/len(trades);lo,hi=wilson(wins,len(trades))
    rng=np.random.default_rng(42);sequence=np.array([t.get('reason')=='TP' for t in trades])
    ruined=0;profits=[];attempt_counts=[]
    # Moving blocks preserve local losing clusters instead of assuming independent trades.
    block=max(1,min(5,len(sequence)))
    for _ in range(samples):
        money=bankroll-fee;s=0;attempt=1; ruin=bankroll<fee
        for day in range(horizon_days):
            if ruin: break
            if day%block==0:
                begin=int(rng.integers(0,len(sequence))); chunk=np.take(sequence,np.arange(begin,begin+block)%len(sequence))
            if chunk[day%block]:
                s+=1
                if s==streak: money+=payout-fee;s=0;attempt+=1
            else: money-=fee;s=0;attempt+=1
            if money<0: ruin=True
        ruined+=ruin;profits.append(money-bankroll);attempt_counts.append(attempt)
    exact=streak_dp(p,fee,payout,streak,bankroll,horizon_days)
    low=streak_dp(lo,fee,payout,streak,bankroll,horizon_days);high=streak_dp(hi,fee,payout,streak,bankroll,horizon_days)
    curve=[{'bankroll':b*fee,**streak_dp(p,fee,payout,streak,b*fee,horizon_days)} for b in (1,2,5,10,20,50,100)]
    worst=cluster=0
    for t in trades:
        cluster=cluster+1 if t.get('reason')=='SL' else 0;worst=max(worst,cluster)
    return {'replay':replay(trades,rules),'hit_rate':p,'wilson_95':[lo,hi],'trade_count':len(trades),'trading_days':len(days),
            'break_even':(fee/(fee+payout))**(1/streak),'ev_per_account':p**streak*payout-(1-p**streak)*fee,
            'block_bootstrap_ruin':ruined/samples,'bootstrap_net_ev':float(np.mean(profits)),
            'expected_attempts':float(np.mean(attempt_counts)),'independent_dp':exact,
            'ruin_uncertainty_range':[high['ruin_probability'],low['ruin_probability']],
            'bankroll_curve':curve,'worst_losing_cluster':worst,'seed':42,'samples':samples,
            'warnings':(['Fewer than 250 trading days: estimates are uncertain.'] if len(days)<250 else [])+
                       ['Streak bankroll model and account-faithful replay are separate analyses. MAE must use the profile point value and quantity.']}

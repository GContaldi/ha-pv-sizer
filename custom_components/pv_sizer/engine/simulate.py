"""Hour-by-hour energy flows of one PV size and battery size."""

from __future__ import annotations

from dataclasses import dataclass, field

from .base import Base
from .common import HOURS


@dataclass
class BatteryCfg:
    power_kw: float
    usable: float
    eff: float
    export_limit: float


def _months() -> list[float]:
    return [0.0] * 12


@dataclass
class Sim:
    cons: float = 0.0
    pv: float = 0.0
    imp: float = 0.0
    exp: float = 0.0
    curt: float = 0.0
    pv_self: float = 0.0
    m_direct: list[float] = field(default_factory=_months)
    m_batt: list[float] = field(default_factory=_months)
    m_imp: list[float] = field(default_factory=_months)
    m_pv_self: list[float] = field(default_factory=_months)
    m_exp: list[float] = field(default_factory=_months)
    m_curt: list[float] = field(default_factory=_months)


def simulate(load: list[float], base: Base, kwp: float, cap: float, bat: BatteryCfg) -> Sim:
    s = Sim()
    cap_u = cap * bat.usable
    soc = cap_u * 0.5
    power, eff, limit = bat.power_kw, bat.eff, bat.export_limit
    pv1, month_of_hour = base.pv1, base.month_of_hour
    m_direct, m_batt, m_imp, m_pv_self, m_exp, m_curt = s.m_direct, s.m_batt, s.m_imp, s.m_pv_self, s.m_exp, s.m_curt
    cons = pv_tot = imp_tot = exp_tot = curt_tot = self_tot = 0.0
    for h in range(HOURS):
        m = month_of_hour[h]
        pv = kwp * pv1[h]
        lo = load[h]
        direct = min(pv, lo)
        net = pv - lo
        ch = dis = im = ex = cu = 0.0
        if net > 0:
            ch = min(net, power, (cap_u - soc) / eff) if cap_u > 0 else 0.0
            soc += ch * eff
            ex = min(net - ch, limit)
            cu = net - ch - ex
        else:
            dis = min(-net, power, soc) if cap_u > 0 else 0.0
            soc -= dis
            im = -net - dis
        cons += lo
        pv_tot += pv
        imp_tot += im
        exp_tot += ex
        curt_tot += cu
        self_tot += direct + ch
        m_direct[m] += direct
        m_batt[m] += dis
        m_imp[m] += im
        m_pv_self[m] += direct + ch
        m_exp[m] += ex
        m_curt[m] += cu
    s.cons, s.pv, s.imp, s.exp, s.curt, s.pv_self = cons, pv_tot, imp_tot, exp_tot, curt_tot, self_tot
    return s

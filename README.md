# PV Sizer

A Home Assistant integration that helps you choose a photovoltaic system and a battery from your own
consumption. It adds a **Fotovoltaico** panel to the sidebar (admins only; the interface is in Italian).

For every PV size × battery size you want to compare, it simulates each hour of a typical year and shows
the bill, the savings, self-sufficiency, payback and the cash flow over 25 years, with and without moving
washing machine, dishwasher, heat pump and similar loads into the sunny hours.

## What it uses

- **Consumption**: hourly long-term statistics of a whole-house energy meter (kWh, from the recorder). The
  grid import of the Energy dashboard is proposed by default. Months not measured yet are estimated from the
  yearly total on your bill. With at least 14 days of history the hours of the day come from the meter too.
- **Loads**: an estimate you type in, or an energy sensor. From a year of hourly history it finds cycles (how
  many, how long, when they usually start) or the daily draw of continuous loads such as a heat pump.
- **House**: climate zone, insulation, heat pump model and heating zones, to estimate heat pump and air
  conditioning when there is no sensor.
- **PV production**: hourly series from [PVGIS](https://re.jrc.ec.europa.eu/pvg_tools/en/) for the location
  of Home Assistant and the roof (tilt, orientation, losses): the year closest to the median of the last
  years. It is downloaded once per roof and kept; without PVGIS a typical year for southern Italy is used.
- **Tariff and costs**: Italian bill structure (energy, excise, VAT, fixed and power fees, dedicated
  withdrawal for exported energy), system and battery costs, tax deduction, battery and inverter replacement.

Nothing leaves your Home Assistant except the PVGIS request, which sends latitude, longitude and the roof.

## Install

Requires Home Assistant 2026.10 or later.

1. HACS → ⋮ → Custom repositories → add `https://github.com/GContaldi/ha-pv-sizer`, type *Integration*.
2. Install **PV Sizer** and restart Home Assistant.
3. Settings → Devices & services → Add integration → **PV Sizer**.
4. Open **Fotovoltaico** in the sidebar and check *Impostazioni*: meter, house, loads, tariff, roof.

## Development

```sh
# Panel with a simulated backend (no Home Assistant needed)
cd frontend && npm install && npx vite

# Integration
uv sync
uv run ruff check . && uv run pytest
```

The Python engine (`custom_components/pv_sizer/engine/`) is a port of the panel's demo backend
(`frontend/dev/demo-backend.ts`). `npm run fixtures` dumps the demo's answers to `tests/fixtures/`, and
`tests/test_golden.py` checks that the Python engine gives the same results. Change both together.

Releases: push a `v*` tag. The workflow builds the panel and attaches `pv_sizer.zip` to the GitHub release,
which is what HACS installs.

## Credits

- [Home Battery Sizer](https://github.com/karl-petter/home-battery-sizer) (MIT), which showed how to size a
  battery on the recorder's hourly history. PV Sizer adds virtual PV from PVGIS, PV
  sizes and loads that can move.
- [PVGIS](https://re.jrc.ec.europa.eu/pvg_tools/en/), © European Union, Joint Research Centre.

## License

MIT

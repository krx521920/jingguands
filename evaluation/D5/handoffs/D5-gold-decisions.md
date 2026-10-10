# D5 Gold decisions

Date: 2026-10-02
Scope: resolve the remaining EQC-005/006/007 annotation disputes.

## D5-GOLD-001: holder uses canonical legal identity

- Single entity: use the full legal name. `D5-EQC-005` keeps `浙江省国际贸易集团有限公司` as the canonical value; `国贸集团` is only an abbreviation.
- Aggregate group: use `牵头主体全称及其一致行动人`, not a comma-separated mix of abbreviations and names.
- `D5-EQC-007` is updated to `红豆集团有限公司及其一致行动人`. Provenance records both the full legal entity definition and the disclosed concert-party statement.

## D5-GOLD-002: method uses canonical labels

`method` is a normalized text field. The gold value is a concise canonical label, while `raw_value` and provenance keep the complete disclosed wording. Current canonical labels include:

- `协议转让`
- `公开征集协议转让`
- `司法拍卖被动减持`
- `集中竞价交易`
- `集中竞价及大宗交易`
- `可转债转股被动稀释`

Therefore `D5-EQC-006` is updated from the full sentence to `可转债转股被动稀释`. `D5-EQC-005` remains `公开征集协议转让`; `D5-EQC-007` remains `司法拍卖被动减持`.

## D5-GOLD-003: change_date is the effective change date

`change_date` records when the disclosed equity change takes effect or is completed, not the announcement date and not an intermediate auction/transaction window.

- `D5-EQC-007` stays `2026-09-29`, the date the judicial-auction shares completed transfer registration.
- The auction window `2026-09-20/2026-09-21` is context, not the effective change date.

## D5-GOLD-004: equal shares remain extracted

`D5-EQC-006` explicitly discloses both before and after share counts as `249,519,764`. Gold keeps both fields as `extracted`. A run that occasionally returns `not_mentioned` for these fields is a stability/reliability defect, not a reason to weaken Gold.

Required follow-up: repeat the same input multiple times and require stable extraction of both unchanged share counts. A rule fallback may be used only if the values are tied to explicit block evidence.

## Consequence

`96.2%` is not the upper bound. The remaining differences are mostly annotation/canonicalization issues or run instability:

- `EQC-005`: full legal name versus abbreviation.
- `EQC-006`: nondeterministic omission of explicitly disclosed equal share counts.
- `EQC-007`: canonical aggregate holder, canonical method label, and effective date.

After the Gold updates, the next upstream batch must be re-run and re-compared. The target remains a clean ten-document batch, not a relaxed acceptance threshold.

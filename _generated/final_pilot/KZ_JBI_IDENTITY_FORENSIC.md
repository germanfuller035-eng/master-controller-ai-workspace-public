# KZ-JBI_RU — Identity Forensic

**Дата:** 2026-06-19. Цель: проверить, можно ли снять identity mismatch реальной evidence (без принудительного override).

## Данные лида
- canonical company: «Краснодарский Завод ЖБИ» · website: kz-jbi.ru · region: Краснодар · niche: ЖБИ.
- email: info@kz-jbi.ru · source: `scraped_site_contact` (нет email_evidence_url).
- identity_match_status: **mismatch** · reason: «visible region/company mismatch».

## Зафиксированная evidence (из audit_observations)
> «На первом экране видно "Бетон с доставкой от 2650 руб./куб"… но сайт/заголовки говорят про **Санкт-Петербург и ЛО** — для лида "Краснодарский Завод ЖБИ" это может путать регион.»

То есть сайт kz-jbi.ru по наблюдениям относится к Санкт-Петербургу/ЛО, а лид заявлен как краснодарский — контакт `info@kz-jbi.ru` с высокой вероятностью **не принадлежит** краснодарской компании.

## Попытка реальной верификации (read-only)
- `https://kz-jbi.ru/`, `https://www.kz-jbi.ru/`, `http://kz-jbi.ru/kontakty/` → **ECONNREFUSED** (сайт недоступен из окружения).
- WebSearch по «kz-jbi.ru … Краснодар/Санкт-Петербург» → результатов нет.
- Контрольная проверка: beton-masters.ru и dkbi.ru **успешно** прочитаны (значит инструмент работает; недоступен именно kz-jbi.ru).

## Классификация
```
KZ_JBI_IDENTITY_STATUS=MISMATCH (подтвердить VERIFIED_MATCH невозможно — сайт недоступен)
KZ_JBI_CONTACT_STATUS=SCRAPED_CONTACT (нет evidence URL, регион не совпадает)
KZ_JBI_SEND_ELIGIBLE=NO
PILOT_EXCLUSION_REASON=BLOCKED_IDENTITY_MISMATCH
```
Искусственно «подходящим» лид не делается. Identity mismatch не снят evidence — значит лид остаётся заблокированным.

# First Touch — Controlled Pilot Package (Task 4)

**Дата:** 2026-06-19 · ветка `feature/first-touch-strategist-controlled-pilot-v1` · base `55aff3a`
**Назначение:** пакет для владельца. Один рекомендованный пилот + готовый no-send черновик первого касания. Отправка НЕ выполняется: `controlled_send_gate=DISABLED`, `transport_enabled=false`, `autosend=BLOCKED`.

## Воронка отбора (детерминированно, реальный store)
- Лидов оценено: **50** · пилот-eligible: **7**.
- Исключения: MISSING_REAL_AUDIT=42, CONTACT_NOT_EVIDENCED=10, MISSING_CONTACT=9, REJECTED=9, TEST_ONLY=2 (лид может попадать под несколько причин).
- Селектор не использует жёстко зашитый список: число берётся из канонического store на момент прогона.

## Top-5 кандидатов (quality_score / score)
| Ранг | lead_id | Компания | Hook | Quality | Score |
|---|---|---|---|---|---|
| 1 ⭐ | BETON-MASTERS_RU | Бетон-Мастер | CONTACT_DISCOVERY_FRICTION | 98 | 84 |
| 2 | DKBI_RU | ДКБИ | WEAK_WEBSITE | 98 | 84 |
| 3 | GBIRESURS_RU | ГБИ Ресурс | REQUEST_PATH_FRICTION | 98 | 84 |
| 4 | KZ-JBI_RU | Краснодарский Завод ЖБИ | WEAK_WEBSITE | 98 | 84 |
| 5 | MEGALIT-KRD_RU | Мегалит Краснодар | WEAK_WEBSITE | 98 | 84 |

При равенстве score сортировка детерминирована по lead_id (стабильный tie-break).

## ⭐ Рекомендованный пилот: BETON-MASTERS_RU (Бетон-Мастер)
- **Статус артефакта:** QA_PASSED · quality 98/PASS · compliance PASS · deliverability READY_NO_SEND (без SMTP-зондирования).
- **Hook (CONTACT_DISCOVERY_FRICTION, confidence 0.7):** «клиенту сложнее быстро найти нужный способ связи». Evidence: `beton-masters.ru` — страница контактов, email betonomaster@yandex.ru, телефоны продаж раздельно для ЖБИ и бетона (наблюдение от 2026-06-12). Не AI-домысел — взято из `audit_observations`.

### Тема (рекомендована subj_a, score 100)
`Наблюдение по сайту`
Альтернативы: `Вопрос по сайту Бетон-Мастер` · `Короткий разбор сайта Бетон-Мастер`

### Тело письма (рекомендовано body_a — 79 слов, 1 CTA, 0 ссылок, 0 цен)
> Здравствуйте.
>
> Посмотрел путь клиента до обращения на сайте Бетон-Мастер глазами нового посетителя. Клиенту сложнее быстро найти нужный способ связи. Из-за этого часть людей, которые уже заинтересованы, может откладывать обращение или уходить к более понятному поставщику.
>
> Отметил ещё один момент по доверию и удобству на телефоне — это влияет на первое впечатление нового клиента. Могу прислать короткий разбор на одной странице — с конкретными наблюдениями и понятными шагами, без созвона и без обязательств с вашей стороны.
>
> Прислать его ответным письмом?

- **CTA:** REPLY_PERMISSION — «Прислать короткий разбор ответным письмом?»
- **Opt-out:** «Если обращения не нужны — ответьте одним словом, и я больше не напишу.»
- **Уникальность:** duplicate_risk=LOW (max_similarity=0).
- **content_hash:** `08d2ed71976f61c9dcb332fac3751ade`. Полный артефакт: `_generated/first_touch/data/recommended_pilot_artifact.json`.

## Шлюзы перед реальной отправкой (все требуют действия владельца)
1. contact_evidenced ✅ · 2. no_commercial_send ✅ · 3. real_audit ✅ · 4. hook_confirmed ✅ · 5. quality_ok (≥85) ✅
6. **owner_text_approved ❌ — не подтверждено** · 7. **transport_disabled (намеренно) — отправка заблокирована**

`/first-touch/pilot-readiness`: `controlled_send_gate=DISABLED`, `send_allowed_live=false`, `approval_token_issued=false`.

**REAL_OUTBOUND_MESSAGES=0, EMAILS_SENT=0, SMTP_CALLS=0, PAYMENT_FACTS=0.**

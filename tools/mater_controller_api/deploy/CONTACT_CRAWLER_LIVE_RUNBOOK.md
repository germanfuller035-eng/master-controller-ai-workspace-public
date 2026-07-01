# Contact Crawler — Live Enablement Runbook (Phase 1)

Дата: 2026-06-20
Контур: Master Controller (VPS `masterctl@195.96.132.82`, `/opt/master-controller`)
Стадия: `LEAD_ENRICH_CRAWL` (между `LEAD_VERIFY` и `LEAD_SCORE`)

> Этот документ — инструкция владельцу. Claude НЕ заходит на боевой VPS без явного запуска.
> Все шаги обратимы; включение защищено двойным гейтом.

---

## 0. Что включаем

Стадия обхода сайта компании, которая поднимает `email_status` до `OFFICIAL_PAGE`
по контактам, найденным на `/contacts`, `/kontakty`, `/o-kompanii`, `/rekvizity`.
До включения стадия работает в offline-режиме (фикстуры) и сети не касается.

Двойной гейт live-обхода:
1. тип `LEAD_ENRICH_CRAWL` добавлен в `MATER_WORKER_TYPES`;
2. env `CONTACT_CRAWL_LIVE=true`.

Без обоих условий краулер остаётся offline.

---

## 1. Предусловия (проверить локально ДО деплоя)

```bash
# из корня репозитория
node tools/tests/contact_site_crawler_c27c_test.mjs        # ожидаем 30/0
node tools/tests/pipeline_enrichment_enrich_v1_test.mjs    # ожидаем 18/0
( cd tools/mater_controller_api && npm test )              # ожидаем 47/0
```

Все три должны быть зелёными. Если нет — НЕ деплоить.

---

## 2. Контролируемый live smoke (без VPS, безопасно)

GET-only обход одного публичного сайта. Формы не отправляются, в стор ничего не пишется.

```bash
# dry (плана, без сети):
node tools/telegram_gateway/contact_site_crawler_live_smoke.mjs --url https://КЛИЕНТСКИЙ-САЙТ.ru

# live (двойной гейт):
CONTACT_CRAWL_LIVE=true node tools/telegram_gateway/contact_site_crawler_live_smoke.mjs \
  --live --url https://КЛИЕНТСКИЙ-САЙТ.ru --max-pages 5

# проверить в выводе: crawl_status, pages_crawled (дошёл ли до /contacts), best_contact_channel, safety.forms_submitted=false
```

---

## 3. Включение на VPS (выполняет владелец)

### 3.1 Бэкап текущей конфигурации
```bash
ssh masterctl@195.96.132.82
sudo cp /etc/master-controller/worker.env /etc/master-controller/worker.env.bak.$(date +%Y%m%d_%H%M%S)
```

### 3.2 Прокатить новый код
```bash
# с рабочей машины (как обычно):
bash tools/mater_controller_api/deploy/deploy.sh
```

### 3.3 Включить стадию (сначала offline — без CONTACT_CRAWL_LIVE)
В `/etc/master-controller/worker.env` привести `MATER_WORKER_TYPES` к полной цепочке:
```
MATER_WORKER_TYPES=LEAD_DISCOVERY,LEAD_VERIFY,LEAD_ENRICH_CRAWL,LEAD_SCORE,AUDIT_GENERATE,DRAFT_GENERATE,FOLLOWUP_PLAN,REPLY_DRAFT_GENERATE,HEALTH_CHECK,METRICS_REFRESH,BACKUP_VERIFY
```
Перезапустить и убедиться, что стадия обрабатывается (в offline она просто проходит к скорингу):
```bash
sudo systemctl restart master-controller-worker
journalctl -u master-controller-worker -n 50 --no-pager
```

### 3.4 Включить live-обход (двойной гейт)
Когда offline-проход подтверждён — добавить в `/etc/master-controller/worker.env`:
```
CONTACT_CRAWL_LIVE=true
```
```bash
sudo systemctl restart master-controller-worker
```

---

## 4. Валидация на нескольких реальных лидах

1. Поставить в discovery 3–5 лидов с рабочими сайтами.
2. Дождаться прохождения `LEAD_VERIFY → LEAD_ENRICH_CRAWL → LEAD_SCORE`.
3. Проверить через API (owner-токен):
```bash
curl -s -H "Authorization: Bearer <OWNER_TOKEN>" \
  http://127.0.0.1:8787/api/v1/mini-audit/leads/<leadId> | jq '{email_status, contact_channels, best_contact_channel, enrichment_crawl_status, evidence_refs}'
```
Критерии успеха:
- лиды с email на странице контактов получили `email_status: OFFICIAL_PAGE`;
- `evidence_refs` содержит URL контактной страницы;
- ни один лид не отправлен (autosend остаётся BLOCKED);
- `master-controller-worker` не падает, память < 192M (`systemctl status`).

---

## 5. Откат

```bash
# вернуть прежний worker.env
sudo cp /etc/master-controller/worker.env.bak.<TS> /etc/master-controller/worker.env
sudo systemctl restart master-controller-worker
```
Либо мягко: убрать `CONTACT_CRAWL_LIVE=true` (краулер вернётся в offline) или убрать
`LEAD_ENRICH_CRAWL` из `MATER_WORKER_TYPES` (стадия перестанет обрабатываться; verify
тогда нужно вернуть на прямой enqueue LEAD_SCORE — см. примечание ниже).

> Примечание: при выключенной стадии `LEAD_VERIFY` всё равно ставит `LEAD_ENRICH_CRAWL`.
> Если стадия не в `MATER_WORKER_TYPES`, job просто не будет claimed (зависнет в QUEUED).
> Поэтому для полного отката стадию из воркера не убирать частично — либо держать тип
> включённым (offline безопасен), либо откатывать код целиком на прежний коммит.

---

## 6. Инварианты (не нарушать)

- Worker остаётся API-only: не пишет canonical-файлы, не открывает SMTP.
- Единый canonical writer (через API → `updateStoreWithRevision`).
- Формы не отправляются, POST не выполняется.
- `manual_verified` и hard-negative статусы (`OPT_OUT`/`BOUNCED`) не перетираются.
- Идемпотентность enrichment по evidence-хэшу.
- Лимит ≤5 страниц на сайт, последовательный обход (память VPS 192M).

# Telegram Master Bot Self-Test Report

Date: 2026-06-08T04:48:23.878Z
Version: v0.7

## NL Router Tests

- ✅ `Завод АТОМ: подготовить follow-up` → `/followup ATOM draft`
- ✅ `АТОМ подготовить фоллоуап` → `/followup ATOM draft`
- ✅ `подготовь follow-up по заводу атом` → `/followup ATOM draft`
- ✅ `ГСК подготовить первое сообщение` → `/lead GSK first_message draft`
- ✅ `КЖБИ статус` → `/status KGBI`
- ✅ `EDERA что дальше` → `/status EDERA`
- ✅ `отчёт по деньгам` → `/report money`
- ✅ `обнови дашборд` → `/execute dashboard`
- ✅ `покажи входящие` → `/inbox`
- ✅ `черновики ответов` → `/reply drafts`
- ✅ `выполни следующее действие` → `/execute next`
- ✅ `отправь письмо клиенту` → `NEEDS_APPROVAL`
- ✅ `удали файл` → `BLOCKED`
- ✅ `Завод АТОМ подготовить follow-up` → `/followup ATOM draft`

## Command Execution Tests

- ❌ /followup ATOM draft → draft_created
- ✅ outbound_drafts.json has ATOM entry
- ✅ No client send happened

## Daily Lead Factory Tests

- ✅ daily_report.json exists
- ❌ daily_report.json has required fields
- ✅ leads_test.csv exists
- ✅ leads_test.csv has 5 leads
- ✅ events_log.json exists

## Summary

Tests: 22 | Passed: 20 | Failed: 2
Status: ⚠️ SOME FAILED
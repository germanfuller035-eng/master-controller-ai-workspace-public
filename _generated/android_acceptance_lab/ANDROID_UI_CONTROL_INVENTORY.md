Все 7 областей просканированы (один субагент перезапущен после ошибки 504). Свожу результат в единый инвентарь. Отчёт на русском, структурные данные — в исходном виде.

# Инвентарь интерактивных контролов (release runtime, без @Preview/test/androidTest)

Соглашения по подсчёту: динамические списочные контролы (`*_row_${id}`, `*_card_${id}`, `filter_${name}`) считаются за 1 шаблон. `Card`/`SectionCard` без `onClick` и `LinearProgressIndicator` исключены как неинтерактивные. Отключённые `AssistChip` (`enabled=false`) включены только там, где субагент явно их отметил как структурно присутствующий контрол (DECORATIVE_DISABLED).

```json
{
  "home/TodayScreen": [
    {"control_id":"today_retry","file":"home/TodayScreen.kt:26-29","control_type":"Button(ErrorState onRetry)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"ui.error!=null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"today_api_chip","file":"home/TodayScreen.kt:39","control_type":"AssistChip(enabled=false)","visible_text":"Сервер недоступен/API доступен/недоступен","test_tag":"MISSING","content_description":null,"enabled_condition":"never","disabled_reason":"индикатор статуса, onClick={}","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"},
    {"control_id":"today_card_command_center","file":"home/TodayScreen.kt:42-46","control_type":"SectionCard(onClick)","visible_text":"Командный центр","test_tag":"card_command_center","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenCommandCenter()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"today_card_next_action","file":"home/TodayScreen.kt:51-57","control_type":"SectionCard(onClick)","visible_text":"Следующее действие","test_tag":"card_next_action","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenMiniAudit()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"today_card_commercial","file":"home/TodayScreen.kt:59-63","control_type":"SectionCard(onClick)","visible_text":"Коммерческая сводка","test_tag":"card_commercial","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenCommercial()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"today_card_campaigns","file":"home/TodayScreen.kt:65-69","control_type":"SectionCard(onClick)","visible_text":"Кампании","test_tag":"card_campaigns","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenCampaigns()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"today_card_ready","file":"home/TodayScreen.kt:75","control_type":"SectionCard(onClick)","visible_text":"Готовы к отправке","test_tag":"card_ready","content_description":null,"enabled_condition":"ui.status!=null","disabled_reason":null,"expected_behavior":"onOpenMiniAudit()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"today_card_waiting","file":"home/TodayScreen.kt:76","control_type":"SectionCard(onClick)","visible_text":"Ожидают ответа","test_tag":"card_waiting","content_description":null,"enabled_condition":"ui.status!=null","disabled_reason":null,"expected_behavior":"onOpenMiniAudit()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"today_card_followup","file":"home/TodayScreen.kt:77","control_type":"SectionCard(onClick)","visible_text":"Повторный контакт к отправке","test_tag":"card_followup","content_description":null,"enabled_condition":"ui.status!=null","disabled_reason":null,"expected_behavior":"onOpenMiniAudit()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"today_card_needs","file":"home/TodayScreen.kt:78","control_type":"SectionCard(onClick)","visible_text":"Требуют проверки","test_tag":"card_needs","content_description":null,"enabled_condition":"ui.status!=null","disabled_reason":null,"expected_behavior":"onOpenMiniAudit()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"today_card_uncertain","file":"home/TodayScreen.kt:79","control_type":"SectionCard(onClick)","visible_text":"Неопределённые отправки","test_tag":"card_uncertain","content_description":null,"enabled_condition":"ui.status!=null","disabled_reason":null,"expected_behavior":"onOpenMiniAudit()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "commandcenter/CommandCenterScreen": [
    {"control_id":"cc_retry","file":"commandcenter/CommandCenterScreen.kt:39","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"ui.error!=null && ui.snapshot==null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"cc_outbound_chip","file":"commandcenter/CommandCenterScreen.kt:54","control_type":"AssistChip(enabled=false)","visible_text":"Исходящие отключены","test_tag":"MISSING","content_description":null,"enabled_condition":"never","disabled_reason":"индикатор статуса","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"},
    {"control_id":"cc_all_decisions","file":"commandcenter/CommandCenterScreen.kt:78","control_type":"TextButton","visible_text":"Все решения","test_tag":"MISSING","content_description":null,"enabled_condition":"decs.isNotEmpty()","disabled_reason":null,"expected_behavior":"onOpenDecisions()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cc_all_incidents","file":"commandcenter/CommandCenterScreen.kt:90","control_type":"TextButton","visible_text":"Все инциденты","test_tag":"MISSING","content_description":null,"enabled_condition":"incs.isNotEmpty()","disabled_reason":null,"expected_behavior":"onOpenIncidents()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "commandcenter/OwnerListScreen": [
    {"control_id":"owner_retry","file":"commandcenter/OwnerListScreen.kt:96","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"ui.error!=null","disabled_reason":null,"expected_behavior":"vm.load(kind)","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"owner_incident_ack","file":"commandcenter/OwnerListScreen.kt:107-111","control_type":"TextButton(per-item)","visible_text":"Подтвердить/Подтверждаю…/Подтверждён","test_tag":"incident_ack_${i.incident_id}","content_description":null,"enabled_condition":"!acked && ui.acking==null","disabled_reason":"уже подтверждён или идёт другое подтверждение","expected_behavior":"vm.acknowledge → repo.acknowledgeIncident + reload","action_kind":"API_WRITE","risk_class":"TEST_ONLY_WRITE"}
  ],

  "commercial/CommandCenterScreen": [
    {"control_id":"cc_back","file":"commercial/CommandCenterScreen.kt:29","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cc_lead_id","file":"commercial/CommandCenterScreen.kt:44-48","control_type":"OutlinedTextField","visible_text":"ID лида (проверенный)","test_tag":"cc_lead_id","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.setLeadId","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"cc_test_only","file":"commercial/CommandCenterScreen.kt:50","control_type":"Switch","visible_text":"Тестовая/Реальная запись","test_tag":"cc_test_only","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.setTestOnly","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"cc_step_opp","file":"commercial/CommandCenterScreen.kt:66","control_type":"OutlinedButton","visible_text":"1. Создать возможность","test_tag":"cc_step_opp","content_description":null,"enabled_condition":"leadId.isNotBlank() && opportunityId==null && !inFlight","disabled_reason":"нет лида/уже создано/в полёте","expected_behavior":"requestStep(OPPORTUNITY)→диалог→createOpportunity","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"cc_step_offer","file":"commercial/CommandCenterScreen.kt:67","control_type":"OutlinedButton","visible_text":"2. Подготовить предложение","test_tag":"cc_step_offer","content_description":null,"enabled_condition":"opportunityId!=null && offerId==null && !inFlight","disabled_reason":"нет возможности/уже есть/в полёте","expected_behavior":"prepareOffer (черновик-снимок, без отправки)","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"cc_step_decision","file":"commercial/CommandCenterScreen.kt:68","control_type":"OutlinedButton","visible_text":"3. Подтвердить (решение владельца)","test_tag":"cc_step_decision","content_description":null,"enabled_condition":"offerId!=null && dealId==null && !inFlight","disabled_reason":"нет предложения/сделка есть/в полёте","expected_behavior":"recordOwnerDecision(APPROVE)→выигрыш сделки, без отправки","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"cc_step_handoff","file":"commercial/CommandCenterScreen.kt:69","control_type":"OutlinedButton","visible_text":"4. Передать в работу","test_tag":"cc_step_handoff","content_description":null,"enabled_condition":"dealId!=null && handoffId==null && !inFlight","disabled_reason":"нет сделки/передача есть/в полёте","expected_behavior":"createHandoff","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"cc_step_project","file":"commercial/CommandCenterScreen.kt:70","control_type":"OutlinedButton","visible_text":"5. Создать проект","test_tag":"cc_step_project","content_description":null,"enabled_condition":"handoffId!=null && projectId==null && !inFlight","disabled_reason":"нет передачи/проект есть/в полёте","expected_behavior":"createProject","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"cc_step_invoice","file":"commercial/CommandCenterScreen.kt:71","control_type":"OutlinedButton","visible_text":"6. Создать счёт (черновик)","test_tag":"cc_step_invoice","content_description":null,"enabled_condition":"dealId!=null && invoiceId==null && !inFlight","disabled_reason":"нет сделки/счёт есть/в полёте","expected_behavior":"createInvoiceDraft (только ЧЕРНОВИК, платёж отключён)","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"cc_confirm_btn","file":"commercial/CommandCenterScreen.kt:104","control_type":"TextButton(AlertDialog)","visible_text":"Подтвердить","test_tag":"cc_confirm_btn","content_description":null,"enabled_condition":"pendingStep!=null","disabled_reason":"inFlight блокирует двойной тап","expected_behavior":"confirmStep() — реальный API_WRITE шага","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"cc_confirm_cancel","file":"commercial/CommandCenterScreen.kt:105","control_type":"TextButton(AlertDialog)","visible_text":"Отмена","test_tag":"MISSING","content_description":null,"enabled_condition":"pendingStep!=null","disabled_reason":null,"expected_behavior":"cancelStep()","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"}
  ],

  "commercial/CommercialSummaryScreen": [
    {"control_id":"cs_back","file":"commercial/CommercialSummaryScreen.kt:50","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_refresh","file":"commercial/CommercialSummaryScreen.kt:51","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"cs_retry","file":"commercial/CommercialSummaryScreen.kt:57","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"ui.error!=null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"cs_catalog","file":"commercial/CommercialSummaryScreen.kt:63","control_type":"SectionCard(onClick)","visible_text":"Каталог продуктов","test_tag":"cs_catalog","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenCatalog()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_queues","file":"commercial/CommercialSummaryScreen.kt:64","control_type":"SectionCard(onClick)","visible_text":"Очереди и сводка","test_tag":"cs_queues","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenQueues()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_agents","file":"commercial/CommercialSummaryScreen.kt:65","control_type":"SectionCard(onClick)","visible_text":"Агенты","test_tag":"cs_agents","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenAgents()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_ai_usage","file":"commercial/CommercialSummaryScreen.kt:66","control_type":"SectionCard(onClick)","visible_text":"Расход ИИ","test_tag":"cs_ai_usage","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenAiUsage()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_source_registry","file":"commercial/CommercialSummaryScreen.kt:67","control_type":"SectionCard(onClick)","visible_text":"Реестр источников","test_tag":"cs_source_registry","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenSourceRegistry()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_knowledge","file":"commercial/CommercialSummaryScreen.kt:68","control_type":"SectionCard(onClick)","visible_text":"Радар знаний","test_tag":"cs_knowledge","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenKnowledge()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_first_touch","file":"commercial/CommercialSummaryScreen.kt:69","control_type":"SectionCard(onClick)","visible_text":"Первое касание","test_tag":"cs_first_touch","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenFirstTouch()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_multichannel","file":"commercial/CommercialSummaryScreen.kt:70","control_type":"SectionCard(onClick)","visible_text":"Источники и каналы","test_tag":"cs_multichannel","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenMultichannel()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_conversations","file":"commercial/CommercialSummaryScreen.kt:71","control_type":"SectionCard(onClick)","visible_text":"Диалоги","test_tag":"cs_conversations","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenConversations()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_delivery_review","file":"commercial/CommercialSummaryScreen.kt:72","control_type":"SectionCard(onClick)","visible_text":"Статусы доставки требуют сверки","test_tag":"cs_delivery_review","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenDeliveryReview()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_commands","file":"commercial/CommercialSummaryScreen.kt:74","control_type":"SectionCard(onClick)","visible_text":"Коммерческие действия","test_tag":"cs_commands","content_description":null,"enabled_condition":"integration.commercialCommandsEnabled==true (feature-flag)","disabled_reason":"скрыт целиком если флаг не включён","expected_behavior":"onOpenCommands()→CommandCenter (DANGEROUS API_WRITE)","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_send_review","file":"commercial/CommercialSummaryScreen.kt:78","control_type":"SectionCard(onClick)","visible_text":"Ожидают отправки (проверка)","test_tag":"cs_send_review","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenSendReview()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_test_only","file":"commercial/CommercialSummaryScreen.kt:102","control_type":"SectionCard(onClick)","visible_text":"Тестовые коммерческие записи","test_tag":"cs_test_only","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenTestOnly()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cs_decorative_x12","file":"commercial/CommercialSummaryScreen.kt:76-94","control_type":"SectionCard(onClick=null) ×12","visible_text":"cs_open_opps, cs_offers, cs_deals_won, cs_handoff, cs_invoices_due, cs_decisions, cs_pipeline, cs_confirmed, cs_payments, cs_fin_confirmed, cs_fin_estimated, cs_fin_unpaid","test_tag":"(каждый имеет свой tag)","content_description":null,"enabled_condition":"onClick не передан","disabled_reason":"информационные карточки-счётчики","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"}
  ],

  "commercial/OfferReviewScreens (List)": [
    {"control_id":"orl_back","file":"commercial/OfferReviewScreens.kt:40","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"orl_refresh","file":"commercial/OfferReviewScreens.kt:41","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"orl_retry","file":"commercial/OfferReviewScreens.kt:48","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && offers пуст","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"offer_row","file":"commercial/OfferReviewScreens.kt:51-66","control_type":"Card(onClick) per-item","visible_text":"карточка предложения","test_tag":"offer_row_${offer.offer_id}","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenOffer→OfferDetailScreen","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "commercial/OfferReviewScreens (Detail)": [
    {"control_id":"od_back","file":"commercial/OfferReviewScreens.kt:103","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"od_refresh","file":"commercial/OfferReviewScreens.kt:104","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.load(offerId)","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"od_retry","file":"commercial/OfferReviewScreens.kt:109","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && offer==null","disabled_reason":null,"expected_behavior":"vm.load(offerId)","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"offer_submit_outcome_hide","file":"commercial/OfferReviewScreens.kt:146","control_type":"TextButton","visible_text":"Скрыть","test_tag":"MISSING (контейнер offer_submit_outcome)","content_description":null,"enabled_condition":"submitMessage!=null","disabled_reason":null,"expected_behavior":"clearSubmitOutcome()","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"offer_act_preview","file":"commercial/OfferReviewScreens.kt:166-170","control_type":"OutlinedButton","visible_text":"Открыть предпросмотр","test_tag":"offer_act_preview","content_description":null,"enabled_condition":"!submitting","disabled_reason":"идёт отправка","expected_behavior":"loadPreview → GET preview (read-only)","action_kind":"API_READ","risk_class":"SAFE_READ"},
    {"control_id":"offer_act_approve","file":"commercial/OfferReviewScreens.kt:172","control_type":"OutlinedButton","visible_text":"Одобрить только текст","test_tag":"offer_act_approve","content_description":null,"enabled_condition":"canDecide (!offline && !SUBMITTING && offer!=null && status==ready_for_send_review)","disabled_reason":"offline/в полёте/статус≠ready","expected_behavior":"offerDecision(APPROVE_DRAFT_FOR_SEND_REVIEW) — только статус, без отправки","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"offer_act_changes","file":"commercial/OfferReviewScreens.kt:173","control_type":"OutlinedButton","visible_text":"Запросить правки","test_tag":"offer_act_changes","content_description":null,"enabled_condition":"canDecide","disabled_reason":"offline/в полёте/статус≠ready","expected_behavior":"offerDecision(REQUEST_CHANGES)","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"offer_act_reject","file":"commercial/OfferReviewScreens.kt:174","control_type":"OutlinedButton","visible_text":"Отклонить черновик","test_tag":"offer_act_reject","content_description":null,"enabled_condition":"canDecide","disabled_reason":"offline/в полёте/статус≠ready","expected_behavior":"offerDecision(REJECT_INTERNAL_DRAFT)","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"offer_act_restore","file":"commercial/OfferReviewScreens.kt:175","control_type":"OutlinedButton","visible_text":"Вернуть на проверку","test_tag":"offer_act_restore","content_description":null,"enabled_condition":"canRestore (status in rejected/changes_requested)","disabled_reason":"offline/в полёте/статус не тот","expected_behavior":"offerDecision(RETURN_FOR_EDIT)","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"offer_action_confirm","file":"commercial/OfferReviewScreens.kt:225-232","control_type":"TextButton(AlertDialog)","visible_text":"Подтвердить","test_tag":"offer_action_confirm","content_description":null,"enabled_condition":"pendingAction!=null","disabled_reason":"offline отклоняется в VM, SUBMITTING guard","expected_behavior":"submitDecision — реальный API_WRITE, revision-guarded","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"offer_action_cancel","file":"commercial/OfferReviewScreens.kt:234","control_type":"TextButton(AlertDialog)","visible_text":"Отмена","test_tag":"MISSING","content_description":null,"enabled_condition":"pendingAction!=null","disabled_reason":null,"expected_behavior":"pendingAction=null","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"offer_preview_close","file":"commercial/OfferReviewScreens.kt:260","control_type":"TextButton","visible_text":"Закрыть","test_tag":"offer_preview_close","content_description":null,"enabled_condition":"previewState!=IDLE","disabled_reason":null,"expected_behavior":"clearPreview()","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"}
  ],

  "campaigns/CampaignsScreen": [
    {"control_id":"campaigns_no_send_badge","file":"campaigns/CampaignsScreen.kt:49-54","control_type":"AssistChip(enabled=false)","visible_text":"Режим: без отправки","test_tag":"campaigns_no_send_badge","content_description":null,"enabled_condition":"never","disabled_reason":"индикатор инварианта no-send","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"},
    {"control_id":"campaigns_retry","file":"campaigns/CampaignsScreen.kt:57","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"ui.error!=null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"campaign_status_chip","file":"campaigns/CampaignsScreen.kt:81","control_type":"AssistChip(enabled=false)","visible_text":"Статус кампании","test_tag":"MISSING","content_description":null,"enabled_condition":"never","disabled_reason":"декоративный статус-чип","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"}
  ],

  "agents/AgentsScreens (Agents)": [
    {"control_id":"ag_back","file":"agents/AgentsScreens.kt:29","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"ag_refresh","file":"agents/AgentsScreens.kt:30","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"ag_role_card","file":"agents/AgentsScreens.kt:81","control_type":"SectionCard(onClick=null)","visible_text":"роль агента","test_tag":"ag_${p.profile}","content_description":null,"enabled_condition":"onClick=null → no-op","disabled_reason":"декоративная карточка","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"},
    {"control_id":"ag_run_wave","file":"agents/AgentsScreens.kt:86","control_type":"Button","visible_text":"Запустить shadow-анализ/Анализ выполняется…","test_tag":"ag_run_wave","content_description":null,"enabled_condition":"!waveSubmitting","disabled_reason":"анализ в работе","expected_behavior":"открывает диалог (confirmWave=true)","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"ag_wave_confirm","file":"agents/AgentsScreens.kt:146","control_type":"TextButton(AlertDialog)","visible_text":"Запустить","test_tag":"ag_wave_confirm","content_description":null,"enabled_condition":"!waveSubmitting","disabled_reason":"double-tap guard","expected_behavior":"runShadowWave — теневой анализ без отправки","action_kind":"API_WRITE","risk_class":"TEST_ONLY_WRITE"},
    {"control_id":"ag_wave_cancel","file":"agents/AgentsScreens.kt:152","control_type":"TextButton(AlertDialog)","visible_text":"Отмена","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"confirmWave=false","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"}
  ],

  "agents/AgentsScreens (OwnerQueues)": [
    {"control_id":"oq_back","file":"agents/AgentsScreens.kt:181","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"oq_refresh","file":"agents/AgentsScreens.kt:182","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"q_ready/q_awaiting/q_replies/q_followup/q_delivery/q_agents/q_test","file":"agents/AgentsScreens.kt:198-204","control_type":"SectionCard(onClick) ×7","visible_text":"Ожидают отправки/Ожидают ответа/Ответы получены/Повторный контакт/Требуют сверки доставки/Агентские результаты/Тестовые записи","test_tag":"q_ready,q_awaiting,q_replies,q_followup,q_delivery,q_agents,q_test","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenSendReview()/onOpenQueue(...)","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "agents/QueueDetailScreen": [
    {"control_id":"qd_back","file":"agents/QueueDetailScreen.kt:40","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"qd_refresh","file":"agents/QueueDetailScreen.kt:41","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()→load","action_kind":"REFRESH","risk_class":"SAFE_READ"}
  ],

  "operations/OperationsScreens (Home)": [
    {"control_id":"ops_refresh","file":"operations/OperationsScreens.kt:45","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"ops_card_x17","file":"operations/OperationsScreens.kt:51-81","control_type":"SectionCard(onClick) ×17","visible_text":"Надёжность/Расходы/Резервные копии/Push/Автоматизация/Очередь задач/Ошибки обработки/Источники/Реестр источников/Телеметрия/Лимиты и автоматизация/Резервуар/Расход ИИ/Радар знаний/Первое касание/Планировщик/Подключение","test_tag":"ops_card_reliability,ops_card_cost,ops_card_backup,ops_card_push,ops_card_automation,ops_card_queue,ops_card_deadletters,ops_card_sources,ops_card_source_registry,ops_card_source_telemetry,ops_card_owner_settings,ops_card_reservoir,ops_card_ai_usage,ops_card_knowledge,ops_card_first_touch,ops_card_scheduler,ops_card_connection","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"навигация на соответствующие экраны","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "operations/OperationsScreens (Detail)": [
    {"control_id":"opsd_back","file":"operations/OperationsScreens.kt:106","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"opsd_refresh","file":"operations/OperationsScreens.kt:107","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"btn_retry_<jobId>","file":"operations/OperationsScreens.kt:180","control_type":"Button(per-item)","visible_text":"Повтор","test_tag":"btn_retry_${j.jobId}","content_description":null,"enabled_condition":"ui.retry!=Submitting","disabled_reason":"повтор уже выполняется","expected_behavior":"vm.retry — переочередь dead-letter (идемпотентно, без отправки)","action_kind":"API_WRITE","risk_class":"TEST_ONLY_WRITE"},
    {"control_id":"source_<name>","file":"operations/OperationsScreens.kt:198","control_type":"SectionCard(onClick=null)","visible_text":"имя источника","test_tag":"source_$name","content_description":null,"enabled_condition":"onClick=null → no-op","disabled_reason":"декоративная карточка","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"}
  ],

  "ownersettings/OwnerSettingsScreen": [
    {"control_id":"osettings_back","file":"ownersettings/OwnerSettingsScreen.kt:38","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"osettings_refresh","file":"ownersettings/OwnerSettingsScreen.kt:39","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh() + сброс черновика","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"settings_save_outcome_hide","file":"ownersettings/OwnerSettingsScreen.kt:62","control_type":"TextButton","visible_text":"Скрыть","test_tag":"MISSING (родитель settings_save_outcome)","content_description":null,"enabled_condition":"saveMessage!=null","disabled_reason":null,"expected_behavior":"clearSaveOutcome()","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"profile_<code>","file":"ownersettings/OwnerSettingsScreen.kt:80","control_type":"FilterChip","visible_text":"профиль (economy/balanced/active/custom)","test_tag":"profile_$code","content_description":null,"enabled_condition":"ui.editable","disabled_reason":"offline/нет данных/во время сохранения","expected_behavior":"setProfile (черновик)","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"num_<field>","file":"ownersettings/OwnerSettingsScreen.kt:206","control_type":"OutlinedTextField ×14","visible_text":"числовое поле лимита","test_tag":"num_$tag","content_description":null,"enabled_condition":"ui.editable","disabled_reason":"offline/нет данных/сохранение","expected_behavior":"setNumeric (clamp, профиль→custom)","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"slider_<field>","file":"ownersettings/OwnerSettingsScreen.kt:219","control_type":"Slider","visible_text":"слайдер лимита","test_tag":"slider_$tag","content_description":null,"enabled_condition":"ui.editable && hardLimit>0","disabled_reason":"offline/нет данных/сохранение","expected_behavior":"setNumeric","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"strategy_<wire>","file":"ownersettings/OwnerSettingsScreen.kt:110","control_type":"RadioButton","visible_text":"стратегия источников (FREE_ONLY/FREE_WITH_PAID_RESERVE/ALL_ALLOWED)","test_tag":"strategy_${choice.wire}","content_description":null,"enabled_condition":"ui.editable","disabled_reason":"offline/нет данных/сохранение","expected_behavior":"setStrategy (черновик)","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"confirm_paid","file":"ownersettings/OwnerSettingsScreen.kt:121","control_type":"Checkbox","visible_text":"Подтверждаю использование платных источников","test_tag":"confirm_paid","content_description":null,"enabled_condition":"ui.editable && draftStrategy.requiresPaid","disabled_reason":"offline/нет данных/сохранение","expected_behavior":"setConfirmPaid (шлюз сохранения)","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"settings_review_save","file":"ownersettings/OwnerSettingsScreen.kt:149","control_type":"Button","visible_text":"Просмотреть и сохранить/Сохраняем…","test_tag":"settings_review_save","content_description":null,"enabled_condition":"editable && hasChanges && saveState!=SUBMITTING","disabled_reason":"offline/без изменений/отправка","expected_behavior":"openDiff() (diff-диалог)","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"settings_confirm_save","file":"ownersettings/OwnerSettingsScreen.kt:269","control_type":"TextButton(AlertDialog)","visible_text":"Сохранить","test_tag":"settings_confirm_save","content_description":null,"enabled_condition":"saveState!=SUBMITTING (+ VM-шлюзы)","disabled_reason":"отправка; VM отклоняет offline и неподтверждённые платные","expected_behavior":"save() → POST /owner/settings (revision+idempotency)","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"settings_diff_cancel","file":"ownersettings/OwnerSettingsScreen.kt:271","control_type":"TextButton(AlertDialog)","visible_text":"Отмена","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"closeDiff()","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"}
  ],

  "automation/AutomationScreen": [
    {"control_id":"auto_x8","file":"automation/AutomationScreen.kt:28-35","control_type":"SectionCard(onClick=null) ×8","visible_text":"auto_writer, auto_autosend (BLOCKED), auto_send (отправка отключена), auto_rev, auto_queued, auto_running, auto_dead, auto_maint","test_tag":"auto_writer,auto_autosend,auto_send,auto_rev,auto_queued,auto_running,auto_dead,auto_maint","content_description":null,"enabled_condition":"onClick=null → no-op","disabled_reason":"только отображение статуса; kill-switch автоотправки серверный","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"}
  ],

  "system/SystemScreen": [
    {"control_id":"system_refresh","file":"system/SystemScreen.kt:31","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"}
  ],

  "reliability/ReliabilityScreen": [
    {"control_id":"rel_error_retry","file":"reliability/ReliabilityScreen.kt:113","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && data==null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"rel_outbound_chip","file":"reliability/ReliabilityScreen.kt:124","control_type":"AssistChip(enabled=false)","visible_text":"Исходящие отключены","test_tag":"MISSING","content_description":null,"enabled_condition":"never","disabled_reason":"статусный бейдж","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"},
    {"control_id":"autopilot_OBSERVE/PREPARE/MANAGED","file":"reliability/ReliabilityScreen.kt:135-141","control_type":"FilterChip ×3","visible_text":"OBSERVE/PREPARE/MANAGED","test_tag":"autopilot_OBSERVE,autopilot_PREPARE,autopilot_MANAGED","content_description":null,"enabled_condition":"!ui.autopilotBusy","disabled_reason":"переключение режима в полёте","expected_behavior":"setAutopilot → repo.setAutopilotMode + re-read; LIMITED_AUTOMATION заблокирован сервером","action_kind":"API_WRITE","risk_class":"DANGEROUS"}
  ],

  "cost/CostCenterScreen": [
    {"control_id":"cost_back","file":"cost/CostCenterScreen.kt:93","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"cost_refresh","file":"cost/CostCenterScreen.kt:94","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"cost_error_retry","file":"cost/CostCenterScreen.kt:99","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && data==null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"cost_open_usage_detail","file":"cost/CostCenterScreen.kt:155","control_type":"TextButton","visible_text":"Подробный учёт ИИ","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenUsageDetail()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "backup/BackupCenterScreen": [
    {"control_id":"backup_back","file":"backup/BackupCenterScreen.kt:92","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"backup_refresh","file":"backup/BackupCenterScreen.kt:93","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"backup_error_retry","file":"backup/BackupCenterScreen.kt:98","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && status==null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"backup_readonly_chip","file":"backup/BackupCenterScreen.kt:114","control_type":"AssistChip(enabled=false)","visible_text":"Только чтение · откат вручную","test_tag":"MISSING","content_description":null,"enabled_condition":"never","disabled_reason":"информационный бейдж","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"},
    {"control_id":"backup_run_drill","file":"backup/BackupCenterScreen.kt:124","control_type":"Button","visible_text":"Проверить восстановление/Проверка…","test_tag":"backup_run_drill","content_description":null,"enabled_condition":"!ui.drillRunning","disabled_reason":"drill уже выполняется","expected_behavior":"runDrill → restoreDrill (НЕдеструктивно, live данные не тронуты)","action_kind":"API_WRITE","risk_class":"TEST_ONLY_WRITE"}
  ],

  "push/PushSettingsScreen": [
    {"control_id":"push_back","file":"push/PushSettingsScreen.kt:104","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"push_refresh","file":"push/PushSettingsScreen.kt:105","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"push_error_retry","file":"push/PushSettingsScreen.kt:110","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && status==null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"push_service_chip","file":"push/PushSettingsScreen.kt:126","control_type":"AssistChip(enabled=false)","visible_text":"Только служебные уведомления","test_tag":"MISSING","content_description":null,"enabled_condition":"never","disabled_reason":"информационный бейдж","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"},
    {"control_id":"push_switch_enabled","file":"push/PushSettingsScreen.kt:133","control_type":"Switch","visible_text":"Получать push","test_tag":"MISSING","content_description":null,"enabled_condition":"always (master)","disabled_reason":null,"expected_behavior":"update(enabled) → pushSetPreferences; доставка гейтится сервером (CREDENTIAL_REQUIRED/DISABLED_BY_CONFIG)","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"push_switch_decisions/incidents/daily_brief","file":"push/PushSettingsScreen.kt:134-136","control_type":"Switch ×3","visible_text":"Решения владельца/Инциденты/Ежедневная сводка","test_tag":"MISSING","content_description":null,"enabled_condition":"p.enabled","disabled_reason":"master выключен","expected_behavior":"update(...) → pushSetPreferences (routing pref)","action_kind":"API_WRITE","risk_class":"TEST_ONLY_WRITE"},
    {"control_id":"push_severity_P0/P1/P2","file":"push/PushSettingsScreen.kt:140-141","control_type":"FilterChip ×3","visible_text":"Критично P0/Важно P1/Инфо P2","test_tag":"MISSING","content_description":null,"enabled_condition":"p.enabled","disabled_reason":"master выключен","expected_behavior":"update(min_severity) → pushSetPreferences","action_kind":"API_WRITE","risk_class":"TEST_ONLY_WRITE"}
  ],

  "knowledge/KnowledgeScreens (Home)": [
    {"control_id":"kn_home_back","file":"knowledge/KnowledgeScreens.kt:35","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"kn_urgent/kn_weekly/kn_monthly/kn_sources/kn_status","file":"knowledge/KnowledgeScreens.kt:39-45","control_type":"SectionCard(onClick) ×5","visible_text":"Срочное/Недельная сводка/Месячный обзор/Источники знаний/Состояние радара","test_tag":"kn_urgent,kn_weekly,kn_monthly,kn_sources,kn_status","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenDigest/onOpenSources/onOpenStatus","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "knowledge/KnowledgeScreens (Digest)": [
    {"control_id":"kn_digest_back","file":"knowledge/KnowledgeScreens.kt:71","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"kn_digest_refresh","file":"knowledge/KnowledgeScreens.kt:72","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.load(win)","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"kn_digest_error_retry","file":"knowledge/KnowledgeScreens.kt:76","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && items пуст","disabled_reason":null,"expected_behavior":"vm.load(win)","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"kn_finding_card","file":"knowledge/KnowledgeScreens.kt:107","control_type":"Card(onClick) per-item","visible_text":"item.title","test_tag":"kn_finding_${item.itemKey}","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"открывает FindingActionsDialog (локально)","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"kn_act_open","file":"knowledge/KnowledgeScreens.kt:197","control_type":"OutlinedButton","visible_text":"Открыть первоисточник","test_tag":"kn_act_open","content_description":null,"enabled_condition":"hasValue(source_url)","disabled_reason":"нет source_url","expected_behavior":"uriHandler.openUri + локальное решение OPEN_SOURCE","action_kind":"EXTERNAL_LINK","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"kn_act_task/postpone/irrelevant/erroneous/legal/security","file":"knowledge/KnowledgeScreens.kt:202-207","control_type":"OutlinedButton ×6","visible_text":"Нужна проверка/Отложить/Не относится/Ошибочно/Юр.проверка/Проверка безопасности","test_tag":"kn_act_task,kn_act_postpone,kn_act_irrelevant,kn_act_erroneous,kn_act_legal,kn_act_security","content_description":null,"enabled_condition":"диалог открыт","disabled_reason":null,"expected_behavior":"recordLocalDecision (локально, без сервера)","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"kn_dialog_close","file":"knowledge/KnowledgeScreens.kt:210","control_type":"TextButton","visible_text":"Закрыть","test_tag":"MISSING","content_description":null,"enabled_condition":"диалог открыт","disabled_reason":null,"expected_behavior":"openFinding=null","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"}
  ],

  "knowledge/KnowledgeScreens (Sources+Status)": [
    {"control_id":"kn_sources_back/refresh/retry","file":"knowledge/KnowledgeScreens.kt:238-243","control_type":"IconButton/TextButton/Button(ErrorState)","visible_text":"ArrowBack/Обновить/повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"always (retry: error!=null && items пуст)","disabled_reason":null,"expected_behavior":"onBack()/vm.refresh()","action_kind":"NAVIGATION/REFRESH","risk_class":"SAFE_NAVIGATION/SAFE_READ"},
    {"control_id":"kn_status_back/refresh/retry","file":"knowledge/KnowledgeScreens.kt:272-277","control_type":"IconButton/TextButton/Button(ErrorState)","visible_text":"ArrowBack/Обновить/повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"always (retry: error!=null && status==null)","disabled_reason":null,"expected_behavior":"onBack()/vm.refresh()","action_kind":"NAVIGATION/REFRESH","risk_class":"SAFE_NAVIGATION/SAFE_READ"}
  ],

  "miniaudit/MiniAuditHomeScreen": [
    {"control_id":"ma_home_back","file":"miniaudit/MiniAuditHomeScreen.kt:34","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"ma_home_refresh","file":"miniaudit/MiniAuditHomeScreen.kt:35","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"ma_card_next/ready/preparing/waiting/followup/needs/uncertain/status","file":"miniaudit/MiniAuditHomeScreen.kt:46-103","control_type":"SectionCard(onClick) ×9","visible_text":"Следующее действие/Готовы к отправке/Готовят аудит/Ожидают ответа/Повторный контакт/Требуют проверки/Неуточнённый статус/Лиды/Статус","test_tag":"ma_card_next,ma_card_ready,ma_card_preparing,ma_card_waiting,ma_card_followup,ma_card_needs,ma_card_uncertain,ma_card_status","content_description":null,"enabled_condition":"always (status_leadcount при leadCount!=null, fallback иначе)","disabled_reason":null,"expected_behavior":"onOpenLead/onOpenBucket(...)","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"ma_why_toggle","file":"miniaudit/MiniAuditHomeScreen.kt:88","control_type":"TextButton","visible_text":"Почему отличаются показатели?/Скрыть пояснение","test_tag":"ma_why_toggle","content_description":null,"enabled_condition":"leadCount!=null","disabled_reason":null,"expected_behavior":"toggle showWhy (локально)","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"}
  ],

  "miniaudit/MiniAuditListScreen": [
    {"control_id":"ma_list_back","file":"miniaudit/MiniAuditListScreen.kt:47","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"ma_list_refresh","file":"miniaudit/MiniAuditListScreen.kt:48","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"ma_search","file":"miniaudit/MiniAuditListScreen.kt:54-59","control_type":"OutlinedTextField","visible_text":"Поиск по компании, домену, email","test_tag":"ma_search","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.onSearch (локальная фильтрация)","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"lead_row_<leadId>","file":"miniaudit/MiniAuditListScreen.kt:76-78","control_type":"Card(onClick) per-item","visible_text":"компания/leadId","test_tag":"lead_row_${lead.leadId}","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenLead","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "miniaudit/LeadDetailScreen": [
    {"control_id":"lead_detail_back","file":"miniaudit/LeadDetailScreen.kt:33","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"tab_0/1/2/3","file":"miniaudit/LeadDetailScreen.kt:43","control_type":"Tab ×4","visible_text":"Обзор/Аудит/Письмо/История","test_tag":"tab_0,tab_1,tab_2,tab_3","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"переключение вкладки (локально)","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"btn_reject","file":"miniaudit/LeadDetailScreen.kt:241","control_type":"OutlinedButton","visible_text":"Отклонить","test_tag":"btn_reject","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"cancelApproval; при approvalId → repo.reject","action_kind":"API_WRITE","risk_class":"TEST_ONLY_WRITE"},
    {"control_id":"btn_confirm_send","file":"miniaudit/LeadDetailScreen.kt:243-247","control_type":"Button","visible_text":"Подтвердить отправку","test_tag":"btn_confirm_send","content_description":null,"enabled_condition":"e.sendable==true && !actionInFlight","disabled_reason":"лид не sendable или действие в полёте","expected_behavior":"prepareSend ШАГ1 — создаёт approval-intent, открывает диалог; письмо НЕ шлёт","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"btn_send_email","file":"miniaudit/LeadDetailScreen.kt:75-77","control_type":"Button(AlertDialog)","visible_text":"Отправить письмо","test_tag":"btn_send_email","content_description":null,"enabled_condition":"approval!=null && !actionInFlight","disabled_reason":"actionInFlight","expected_behavior":"confirmSend ШАГ2 → repo.approve — единственный путь к реальной отправке (заблокирован сервером в no-send)","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"btn_cancel_send","file":"miniaudit/LeadDetailScreen.kt:79","control_type":"TextButton(AlertDialog)","visible_text":"Отмена","test_tag":"btn_cancel_send","content_description":null,"enabled_condition":"диалог виден","disabled_reason":null,"expected_behavior":"cancelApproval (repo.reject)","action_kind":"API_WRITE","risk_class":"TEST_ONLY_WRITE"},
    {"control_id":"approval_dialog_dismiss","file":"miniaudit/LeadDetailScreen.kt:62","control_type":"AlertDialog onDismissRequest","visible_text":"(жест закрытия)","test_tag":"approval_dialog","content_description":null,"enabled_condition":"диалог виден","disabled_reason":null,"expected_behavior":"cancelApproval","action_kind":"API_WRITE","risk_class":"TEST_ONLY_WRITE"}
  ],

  "replies/RepliesScreen": [
    {"control_id":"reply_filter_OPEN/ALL/INTERESTED/NOT_INTERESTED/BOUNCE/UNMATCHED","file":"replies/RepliesScreen.kt:45-61","control_type":"Tab ×6","visible_text":"Новые/Все/Интерес/Отказ/Недоставка/Не определено","test_tag":"reply_filter_OPEN,reply_filter_ALL,reply_filter_INTERESTED,reply_filter_NOT_INTERESTED,reply_filter_BOUNCE,reply_filter_UNMATCHED","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"setFilter→refresh","action_kind":"API_READ","risk_class":"SAFE_READ"},
    {"control_id":"reply_card_<replyId>","file":"replies/RepliesScreen.kt:97-99","control_type":"Card(onClick) per-item","visible_text":"компания/тема ответа","test_tag":"reply_card_${r.replyId}","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenReply (по умолчанию {})","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"reply_unmatched_chip","file":"replies/RepliesScreen.kt:106","control_type":"AssistChip(enabled=false)","visible_text":"Не определено","test_tag":"reply_unmatched","content_description":null,"enabled_condition":"never","disabled_reason":"индикатор статуса","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"},
    {"control_id":"reply_new_chip","file":"replies/RepliesScreen.kt:108","control_type":"AssistChip(enabled=false)","visible_text":"новый","test_tag":"MISSING","content_description":null,"enabled_condition":"never","disabled_reason":"индикатор статуса","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"}
  ],

  "firsttouch/FirstTouchScreen": [
    {"control_id":"ft_back","file":"firsttouch/FirstTouchScreen.kt:34","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"ft_refresh","file":"firsttouch/FirstTouchScreen.kt:35","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"ft_cand_<leadId>","file":"firsttouch/FirstTouchScreen.kt:136","control_type":"Card(onClick) per-item","visible_text":"компания/leadId кандидата","test_tag":"ft_cand_${row.leadId}","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"openCandidate → firstTouchCandidate (GET) + диалог","action_kind":"API_READ","risk_class":"SAFE_READ"},
    {"control_id":"ft_close","file":"firsttouch/FirstTouchScreen.kt:79","control_type":"TextButton(AlertDialog)","visible_text":"Закрыть","test_tag":"ft_close","content_description":null,"enabled_condition":"selected!=null","disabled_reason":null,"expected_behavior":"closeCandidate","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"ft_dialog_dismiss","file":"firsttouch/FirstTouchScreen.kt:78","control_type":"AlertDialog onDismissRequest","visible_text":"(жест закрытия)","test_tag":"MISSING","content_description":null,"enabled_condition":"selected!=null","disabled_reason":null,"expected_behavior":"closeCandidate","action_kind":"LOCAL_TOGGLE","risk_class":"NONE"},
    {"control_id":"ft_generate","file":"firsttouch/FirstTouchScreen.kt:105","control_type":"TextButton","visible_text":"Подготовить черновик","test_tag":"ft_generate","content_description":null,"enabled_condition":"activeDraftId==null && !commandBusy","disabled_reason":"commandBusy","expected_behavior":"generateDraft (no-send)","action_kind":"API_WRITE","risk_class":"TEST_ONLY_WRITE"},
    {"control_id":"ft_select_subject/select_body/approve_text/return_audit/reject/select_pilot","file":"firsttouch/FirstTouchScreen.kt:108-117","control_type":"TextButton ×6","visible_text":"Выбрать тему/Выбрать текст/Одобрить только текст/Вернуть на аудит/Отклонить/Выбрать пилотом","test_tag":"ft_select_subject,ft_select_body,ft_approve_text,ft_return_audit,ft_reject,ft_select_pilot","content_description":null,"enabled_condition":"activeDraftId!=null && !commandBusy","disabled_reason":"commandBusy/нет черновика","expected_behavior":"firstTouch* команды владельца — все явно no-send (send_allowed_live=false)","action_kind":"API_WRITE","risk_class":"TEST_ONLY_WRITE"}
  ],

  "approvals/ApprovalsHomeScreen": [
    {"control_id":"approvals_card_<queueKey>","file":"approvals/ApprovalsHomeScreen.kt:22","control_type":"SectionCard(onClick) ×4","visible_text":"AUDITS/DRAFTS/FOLLOWUPS/REPLY_DRAFTS","test_tag":"approvals_card_${q.key}","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenQueue→ApprovalListScreen","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "approvals/ApprovalListScreen": [
    {"control_id":"list_back","file":"approvals/ApprovalListScreen.kt:38","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"list_refresh","file":"approvals/ApprovalListScreen.kt:39","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"list_error_retry","file":"approvals/ApprovalListScreen.kt:47","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"ui.error!=null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"approval_row_<id>","file":"approvals/ApprovalListScreen.kt:52/64/76","control_type":"Card(onClick) ×3 шаблона (pipeline/lead/reply)","visible_text":"company/lead_id/reply строки","test_tag":"approval_row_$id, approval_row_${lead.leadId}, approval_row_${reply.replyId}","content_description":null,"enabled_condition":"always (reply: leadId!=null)","disabled_reason":null,"expected_behavior":"onOpenItem→ApprovalDetailScreen","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "approvals/ApprovalDetailScreen": [
    {"control_id":"detail_back","file":"approvals/ApprovalDetailScreen.kt:39","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"detail_refresh","file":"approvals/ApprovalDetailScreen.kt:40","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"!submitting","disabled_reason":"идёт мутация","expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"detail_error_retry","file":"approvals/ApprovalDetailScreen.kt:46","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"ui.error!=null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"btn_defer","file":"approvals/ApprovalDetailScreen.kt:110","control_type":"OutlinedButton","visible_text":"Отложить","test_tag":"btn_defer","content_description":null,"enabled_condition":"!submitting","disabled_reason":"идёт мутация","expected_behavior":"defer → postponeFollowup (no-send, 409→reload)","action_kind":"API_WRITE","risk_class":"DANGEROUS"},
    {"control_id":"btn_reject","file":"approvals/ApprovalDetailScreen.kt:112","control_type":"Button","visible_text":"Отклонить","test_tag":"btn_reject","content_description":null,"enabled_condition":"!submitting","disabled_reason":"идёт мутация","expected_behavior":"reject → setLeadStatus(rejected) через gate, no-send","action_kind":"API_WRITE","risk_class":"DANGEROUS"}
  ],

  "reservoir/ReservoirScreen": [
    {"control_id":"reservoir_back","file":"reservoir/ReservoirScreen.kt:32","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"reservoir_refresh","file":"reservoir/ReservoirScreen.kt:33","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"reservoir_error_retry","file":"reservoir/ReservoirScreen.kt:38","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && summary==null && funnel==null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"}
  ],

  "sources/SourceRegistryScreen": [
    {"control_id":"src_registry_back","file":"sources/SourceRegistryScreen.kt:37","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"src_registry_refresh","file":"sources/SourceRegistryScreen.kt:38","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"src_filter_<name>","file":"sources/SourceRegistryScreen.kt:77","control_type":"FilterChip ×9","visible_text":"Все/Активные/Отключённые/Нужны уч.данные/Проблемные/Входящие/Поиск лидов/Платные/Бесплатные","test_tag":"src_filter_${f.name}","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"setFilter (клиентская фильтрация)","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"src_registry_error_retry","file":"sources/SourceRegistryScreen.kt:42","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && sources пуст","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"}
  ],

  "sources/SourceTelemetryScreen": [
    {"control_id":"src_telemetry_back","file":"sources/SourceTelemetryScreen.kt:36","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"src_telemetry_refresh","file":"sources/SourceTelemetryScreen.kt:37","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"tel_filter_<name>","file":"sources/SourceTelemetryScreen.kt:73","control_type":"FilterChip ×6","visible_text":"Все/Активные/Отключённые/Нужны уч.данные/Бесплатные/Платные","test_tag":"tel_filter_${f.name}","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"setFilter (клиентская)","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"src_telemetry_error_retry","file":"sources/SourceTelemetryScreen.kt:41","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && items пуст","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"}
  ],

  "transport/TransportScreens (DeliveryReview)": [
    {"control_id":"delivery_back","file":"transport/TransportScreens.kt:28","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"delivery_refresh","file":"transport/TransportScreens.kt:29","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"delivery_error_retry","file":"transport/TransportScreens.kt:33","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && data==null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"}
  ],

  "transport/TransportScreens (TestOnly)": [
    {"control_id":"test_only_back","file":"transport/TransportScreens.kt:73","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"test_only_refresh","file":"transport/TransportScreens.kt:74","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"to_badge","file":"transport/TransportScreens.kt:83","control_type":"AssistChip(enabled=false)","visible_text":"TEST — не учитывается в выручке","test_tag":"to_badge","content_description":null,"enabled_condition":"never","disabled_reason":"декоративный бейдж","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"},
    {"control_id":"test_only_error_retry","file":"transport/TransportScreens.kt:78","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && data==null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"}
  ],

  "transport/TransportScreens (Conversations)": [
    {"control_id":"conversations_back","file":"transport/TransportScreens.kt:107","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"conversations_refresh","file":"transport/TransportScreens.kt:108","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"conv_<lead_id>","file":"transport/TransportScreens.kt:118-121","control_type":"SectionCard(onClick) per-item","visible_text":"Лид <id> + события","test_tag":"conv_${c.lead_id}","content_description":null,"enabled_condition":"c.lead_id!=null","disabled_reason":null,"expected_behavior":"openTimeline → GET timeline (диалог)","action_kind":"API_READ","risk_class":"SAFE_READ"},
    {"control_id":"timeline_close","file":"transport/TransportScreens.kt:133","control_type":"TextButton(AlertDialog)","visible_text":"Закрыть","test_tag":"MISSING","content_description":null,"enabled_condition":"timeline!=null","disabled_reason":null,"expected_behavior":"closeTimeline()","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"timeline_dismiss","file":"transport/TransportScreens.kt:132","control_type":"AlertDialog onDismissRequest","visible_text":"(жест закрытия)","test_tag":"MISSING","content_description":null,"enabled_condition":"timeline!=null","disabled_reason":null,"expected_behavior":"closeTimeline()","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"conversations_error_retry","file":"transport/TransportScreens.kt:112","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && list==null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"}
  ],

  "settings/SettingsScreen": [
    {"control_id":"theme_chip_DARK/LIGHT/SYSTEM","file":"settings/SettingsScreen.kt:34-38","control_type":"FilterChip ×3","visible_text":"Тёмная/Светлая/Системная","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"setTheme (локально в SettingsStore)","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"switch_bg","file":"settings/SettingsScreen.kt:44","control_type":"Switch","visible_text":"Фоновое обновление","test_tag":"switch_bg","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"setBgRefresh (локальный флаг)","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"switch_notif","file":"settings/SettingsScreen.kt:47","control_type":"Switch","visible_text":"Уведомления","test_tag":"switch_notif","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"setNotifications (локальный флаг)","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"btn_unpair","file":"settings/SettingsScreen.kt:52","control_type":"Button","visible_text":"Выйти / отвязать","test_tag":"btn_unpair","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"unpair() (repo.unpair — сброс токена) + навигация. Необратимо без нового pairing-кода. БЕЗ диалога подтверждения","action_kind":"API_WRITE","risk_class":"DANGEROUS"}
  ],

  "auth/ConnectionScreen": [
    {"control_id":"seg_local/seg_remote","file":"auth/ConnectionScreen.kt:31-36","control_type":"SegmentedButton ×2","visible_text":"Локальный ПК/Удалённый сервер","test_tag":"seg_local,seg_remote","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onRemote(false/true) (локально)","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"field_base_url","file":"auth/ConnectionScreen.kt:44-45","control_type":"OutlinedTextField","visible_text":"Адрес API (base URL)","test_tag":"field_base_url","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBaseUrl","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"field_code","file":"auth/ConnectionScreen.kt:50-51","control_type":"OutlinedTextField","visible_text":"Код подключения","test_tag":"field_code","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onCode (только цифры, до 6)","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"field_device","file":"auth/ConnectionScreen.kt:57-58","control_type":"OutlinedTextField","visible_text":"Имя устройства","test_tag":"field_device","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onDeviceName","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"btn_check","file":"auth/ConnectionScreen.kt:64","control_type":"OutlinedButton","visible_text":"Проверить соединение","test_tag":"btn_check","content_description":null,"enabled_condition":"!s.checking","disabled_reason":"идёт проверка","expected_behavior":"checkConnection → GET /health (read-only)","action_kind":"API_READ","risk_class":"SAFE_READ"},
    {"control_id":"btn_pair","file":"auth/ConnectionScreen.kt:72","control_type":"Button","visible_text":"Подключить устройство","test_tag":"btn_pair","content_description":null,"enabled_condition":"!s.pairing (+валидация 6 цифр)","disabled_reason":"идёт pairing; код≠6 цифр отклоняется","expected_behavior":"pair → repo.pair, сохраняет токен сопряжения; onPaired() навигация","action_kind":"API_WRITE","risk_class":"DANGEROUS"}
  ],

  "ai/AiUsageScreen": [
    {"control_id":"ai_usage_back","file":"ai/AiUsageScreen.kt:30","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"ai_usage_refresh","file":"ai/AiUsageScreen.kt:31","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"ai_usage_error_retry","file":"ai/AiUsageScreen.kt:35","control_type":"Button(ErrorState)","visible_text":"повтор","test_tag":"MISSING","content_description":null,"enabled_condition":"error!=null && usage==null","disabled_reason":null,"expected_behavior":"vm.refresh()","action_kind":"REFRESH","risk_class":"SAFE_READ"},

  "catalog/CatalogListScreen": [
    {"control_id":"catalog_list.back","file":"catalog/CatalogListScreen.kt:39","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"catalog_list.refresh","file":"catalog/CatalogListScreen.kt:40","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh() → GET /products","action_kind":"REFRESH","risk_class":"SAFE_READ"},
    {"control_id":"catalog_search","file":"catalog/CatalogListScreen.kt:59-65","control_type":"OutlinedTextField","visible_text":"Поиск","test_tag":"catalog_search","content_description":null,"enabled_condition":"catalog!=null","disabled_reason":null,"expected_behavior":"setQuery (локально)","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"filter_active/draft/planned","file":"catalog/CatalogListScreen.kt:67-69","control_type":"FilterChip ×3","visible_text":"Активные/Черновики/Планы","test_tag":"filter_active,filter_draft,filter_planned","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"setStatusFilter (локальный тоггл)","action_kind":"LOCAL_TOGGLE","risk_class":"SAFE_READ"},
    {"control_id":"product_row","file":"catalog/CatalogListScreen.kt:89","control_type":"ElevatedCard + Modifier.clickable","visible_text":"название продукта","test_tag":"product_${p.product_id}","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenProduct→ProductDetailScreen","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "catalog/ProductDetailScreen": [
    {"control_id":"product_detail.back","file":"catalog/ProductDetailScreen.kt:36","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"product_detail.refresh","file":"catalog/ProductDetailScreen.kt:37","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh() → GET presentation+product","action_kind":"REFRESH","risk_class":"SAFE_READ"}
  ],

  "multichannel/MultichannelScreen": [
    {"control_id":"multichannel.back","file":"multichannel/MultichannelScreen.kt:27","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"multichannel.refresh","file":"multichannel/MultichannelScreen.kt:28","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh() (read-only; SectionCards без onClick — не интерактивны)","action_kind":"REFRESH","risk_class":"SAFE_READ"}
  ],

  "pipeline/PipelineHomeScreen": [
    {"control_id":"pipeline_card_PRODUCT_ROUTING/STAGING/VERIFIED_READY","file":"pipeline/PipelineHomeScreen.kt:32-37","control_type":"SectionCard(onClick) ×3","visible_text":"Продуктовый маршрут/Новые кандидаты/Проверенные лиды","test_tag":"pipeline_card_PRODUCT_ROUTING,pipeline_card_STAGING,pipeline_card_VERIFIED_READY","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenQueue(...)","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "pipeline/LeadsHomeScreen": [
    {"control_id":"leads_card_PRODUCT_ROUTING/STAGING/VERIFIED_READY/miniaudit","file":"pipeline/LeadsHomeScreen.kt:26-37","control_type":"SectionCard(onClick) ×4","visible_text":"Продуктовый маршрут/Новые кандидаты/Проверенные лиды/Mini Audit","test_tag":"leads_card_PRODUCT_ROUTING,leads_card_STAGING,leads_card_VERIFIED_READY,leads_card_miniaudit","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onOpenQueue/onOpenMiniAudit","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"}
  ],

  "pipeline/PipelineQueueScreen": [
    {"control_id":"pipeline_queue.back","file":"pipeline/PipelineQueueScreen.kt:42","control_type":"IconButton","visible_text":"ArrowBack","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"onBack()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"pipeline_queue.refresh","file":"pipeline/PipelineQueueScreen.kt:43","control_type":"TextButton","visible_text":"Обновить","test_tag":"MISSING","content_description":null,"enabled_condition":"always","disabled_reason":null,"expected_behavior":"vm.refresh() → GET by-status (PipelineLeadRow без onClick — не интерактивна)","action_kind":"REFRESH","risk_class":"SAFE_READ"}
  ],

  "projects/ProjectsScreen": [
    {"control_id":"project_mini_audit","file":"projects/ProjectsScreen.kt:30","control_type":"Card(onClick)","visible_text":"Mini Audit (project.name)","test_tag":"project_mini_audit","content_description":null,"enabled_condition":"project.id==mini_audit","disabled_reason":null,"expected_behavior":"onOpenMiniAudit()","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"btn_open_mini_audit","file":"projects/ProjectsScreen.kt:40","control_type":"Button","visible_text":"Открыть","test_tag":"btn_open_mini_audit","content_description":null,"enabled_condition":"project.id==mini_audit","disabled_reason":null,"expected_behavior":"onOpenMiniAudit() (дубль)","action_kind":"NAVIGATION","risk_class":"SAFE_NAVIGATION"},
    {"control_id":"projects.add_modules_disabled","file":"projects/ProjectsScreen.kt:53-55","control_type":"OutlinedButton(enabled=false)","visible_text":"Добавление модулей — позже","test_tag":"MISSING","content_description":null,"enabled_condition":"never","disabled_reason":"плейсхолдер, onClick={}","expected_behavior":"нет действия","action_kind":"DECORATIVE_DISABLED","risk_class":"NONE"}
  ]
}
```

# COUNT-сводка

```json
{
  "total_interactive_controls": "≈285 (шаблоны списков/фильтров считаются за 1; в рантайме экземпляров больше)",
  "by_feature_area": {
    "home/TodayScreen": 11,
    "commandcenter (CommandCenter+OwnerList)": 6,
    "commercial (CommandCenter+Summary+OfferReview)": "≈58",
    "campaigns": 3,
    "agents+operations+ownersettings+automation+system": 60,
    "reliability+cost+backup+push+knowledge": 38,
    "miniaudit+replies+firsttouch": "≈45",
    "approvals+reservoir+sources+transport+settings+auth+ai": 47,
    "catalog+multichannel+pipeline+projects": 21
  },
  "by_action_kind": {
    "NAVIGATION": "≈110",
    "REFRESH": "≈52",
    "API_READ": 5,
    "API_WRITE": 23,
    "LOCAL_TOGGLE": "≈55",
    "EXTERNAL_LINK": 1,
    "DECORATIVE_DISABLED": "≈40"
  },
  "by_risk_class": {
    "SAFE_NAVIGATION": "≈110",
    "SAFE_READ": "≈90",
    "TEST_ONLY_WRITE": "≈17",
    "DANGEROUS": 23,
    "NONE": "≈45"
  }
}
```

Примечание по подсчёту: точное число зависит от того, считать ли `cs_*` декоративные карточки (12 шт. с `onClick=null`) и `auto_*` (8 шт.) полноценными контролами — они структурно кликабельны, но без обработчика. Без них суммарно ~265 «действующих» контролов.

# Контролы с test_tag = MISSING (нужно добавить testTag)

Сгруппировано: в основном это кнопки `Назад` (IconButton ArrowBack), `Обновить` (TextButton), `повтор` внутри `ErrorState`, кнопки `Отмена`/`Закрыть` в диалогах, и почти все контролы экранов Push и Settings(theme).

```json
{
  "navigation_back_buttons (ArrowBack, все MISSING)": [
    "commercial/CommandCenterScreen.kt:29", "commercial/CommercialSummaryScreen.kt:50",
    "commercial/OfferReviewScreens.kt:40", "commercial/OfferReviewScreens.kt:103",
    "agents/AgentsScreens.kt:29", "agents/AgentsScreens.kt:181", "agents/QueueDetailScreen.kt:40",
    "operations/OperationsScreens.kt:106", "ownersettings/OwnerSettingsScreen.kt:38",
    "cost/CostCenterScreen.kt:93", "backup/BackupCenterScreen.kt:92", "push/PushSettingsScreen.kt:104",
    "knowledge/KnowledgeScreens.kt:35/71/238/272", "miniaudit/MiniAuditHomeScreen.kt:34",
    "miniaudit/MiniAuditListScreen.kt:47", "miniaudit/LeadDetailScreen.kt:33", "firsttouch/FirstTouchScreen.kt:34",
    "approvals/ApprovalListScreen.kt:38", "approvals/ApprovalDetailScreen.kt:39",
    "reservoir/ReservoirScreen.kt:32", "sources/SourceRegistryScreen.kt:37", "sources/SourceTelemetryScreen.kt:36",
    "transport/TransportScreens.kt:28/73/107", "ai/AiUsageScreen.kt:30",
    "catalog/CatalogListScreen.kt:39", "catalog/ProductDetailScreen.kt:36",
    "multichannel/MultichannelScreen.kt:27", "pipeline/PipelineQueueScreen.kt:42"
  ],
  "refresh_buttons (Обновить, все MISSING)": [
    "commercial/CommercialSummaryScreen.kt:51", "commercial/OfferReviewScreens.kt:41/104",
    "agents/AgentsScreens.kt:30/182", "agents/QueueDetailScreen.kt:41",
    "operations/OperationsScreens.kt:45/107", "ownersettings/OwnerSettingsScreen.kt:39",
    "system/SystemScreen.kt:31", "cost/CostCenterScreen.kt:94", "backup/BackupCenterScreen.kt:93",
    "push/PushSettingsScreen.kt:105", "knowledge/KnowledgeScreens.kt:72/239/273",
    "miniaudit/MiniAuditHomeScreen.kt:35", "miniaudit/MiniAuditListScreen.kt:48", "firsttouch/FirstTouchScreen.kt:35",
    "approvals/ApprovalListScreen.kt:39", "approvals/ApprovalDetailScreen.kt:40",
    "reservoir/ReservoirScreen.kt:33", "sources/SourceRegistryScreen.kt:38", "sources/SourceTelemetryScreen.kt:37",
    "transport/TransportScreens.kt:29/74/108", "ai/AiUsageScreen.kt:31",
    "catalog/CatalogListScreen.kt:40", "catalog/ProductDetailScreen.kt:37",
    "multichannel/MultichannelScreen.kt:28", "pipeline/PipelineQueueScreen.kt:43"
  ],
  "error_retry (внутри core.ui.ErrorState — tag не подтверждён, вероятно MISSING)": [
    "home/TodayScreen.kt:26", "commandcenter/CommandCenterScreen.kt:39", "commandcenter/OwnerListScreen.kt:96",
    "commercial/CommercialSummaryScreen.kt:57", "commercial/OfferReviewScreens.kt:48/109",
    "campaigns/CampaignsScreen.kt:57", "reliability:113", "cost:99", "backup:98", "push:110",
    "knowledge:76/243/277", "approvals/ApprovalListScreen.kt:47", "approvals/ApprovalDetailScreen.kt:46",
    "reservoir:38", "sources(registry):42", "sources(telemetry):41", "transport:33/78/112", "ai:35"
  ],
  "dialog_cancel_close_buttons (MISSING)": [
    "commercial/CommandCenterScreen.kt:105 (Отмена)", "commercial/OfferReviewScreens.kt:234 (Отмена)",
    "commercial/OfferReviewScreens.kt:146 (Скрыть)", "agents/AgentsScreens.kt:152 (Отмена)",
    "ownersettings/OwnerSettingsScreen.kt:62 (Скрыть)", "ownersettings/OwnerSettingsScreen.kt:271 (Отмена)",
    "knowledge/KnowledgeScreens.kt:210 (Закрыть)", "firsttouch/FirstTouchScreen.kt:78 (dismiss)",
    "transport/TransportScreens.kt:132/133 (timeline close/dismiss)"
  ],
  "push_settings_all_controls (MISSING)": [
    "push_switch_enabled:133", "push_switch_decisions:134", "push_switch_incidents:135",
    "push_switch_daily_brief:136", "push_severity_P0/P1/P2:140-141", "push_service_chip:126"
  ],
  "settings_theme_chips (MISSING)": [
    "theme_chip_DARK:34", "theme_chip_LIGHT:36", "theme_chip_SYSTEM:38"
  ],
  "other_decorative_or_misc (MISSING)": [
    "today_api_chip:39", "cc_outbound_chip(commandcenter):54", "cc_all_decisions:78", "cc_all_incidents:90",
    "rel_outbound_chip:124", "campaign_status_chip:81", "reply_new_chip:108", "cost_open_usage_detail:155",
    "backup_readonly_chip:114", "projects.add_modules_disabled:53"
  ],
  "estimated_total_MISSING": "≈110"
}
```

# DANGEROUS-контролы (send/payment/gate/suppression/price) — 23 шт., все гейтятся

```json
{
  "commercial/CommandCenter (feature-flag commercialCommandsEnabled, экран скрыт иначе)": [
    {"id":"cc_step_opp","gated":true,"how":"leadId!=blank && opportunityId==null && !inFlight + диалог cc_confirm_btn"},
    {"id":"cc_step_offer","gated":true,"how":"prepareOffer — черновик-снимок, без отправки"},
    {"id":"cc_step_decision","gated":true,"how":"recordOwnerDecision APPROVE — фиксация решения, без отправки"},
    {"id":"cc_step_handoff","gated":true,"how":"precondition + диалог"},
    {"id":"cc_step_project","gated":true,"how":"precondition + диалог"},
    {"id":"cc_step_invoice","gated":true,"how":"счёт только ЧЕРНОВИК; реальная выставка/платёж отключены"},
    {"id":"cc_confirm_btn","gated":true,"how":"виден при pendingStep!=null; inFlight guard; revision-guard, 409→stale"}
  ],
  "commercial/OfferReview (no-send decisions, только смена внутреннего статуса)": [
    {"id":"offer_act_approve","gated":true,"how":"canDecide (!offline && !SUBMITTING && status==ready_for_send_review) + диалог + revision-guard; клиенту НЕ шлёт"},
    {"id":"offer_act_changes","gated":true,"how":"canDecide + диалог"},
    {"id":"offer_act_reject","gated":true,"how":"canDecide + диалог"},
    {"id":"offer_act_restore","gated":true,"how":"canRestore (status in rejected/changes_requested) + диалог"},
    {"id":"offer_action_confirm","gated":true,"how":"виден при pendingAction!=null; offline отклонён в VM; revision-guard, 409→CONFLICT"}
  ],
  "ownersettings": [
    {"id":"settings_confirm_save","gated":true,"how":"VM-шлюзы: блок offline, double-tap, paidNotConfirmed→VALIDATION; expectedRevision+idempotencyKey; меняет лимиты/стратегию источников (вкл. платные)"}
  ],
  "reliability": [
    {"id":"autopilot_OBSERVE/PREPARE/MANAGED","gated":true,"how":"!ui.autopilotBusy; VM re-read для подтверждения; LIMITED_AUTOMATION заблокирован сервером. ⚠ БЕЗ диалога подтверждения перед записью"}
  ],
  "push": [
    {"id":"push_switch_enabled","gated":"частично","how":"master-тоггл всегда enabled; реальная доставка гейтится СЕРВЕРОМ (CREDENTIAL_REQUIRED/DISABLED_BY_CONFIG) — клиентских сообщений не шлёт. ⚠ testTag MISSING"}
  ],
  "miniaudit/LeadDetail (единственный путь реальной отправки письма)": [
    {"id":"btn_confirm_send","gated":true,"how":"ШАГ1: enabled = e.sendable==true && !actionInFlight; только создаёт approval-intent, письмо не шлёт"},
    {"id":"btn_send_email","gated":true,"how":"ШАГ2: виден только в диалоге после ШАГ1; enabled=!actionInFlight; на сервере заблокирован в no-send режиме"}
  ],
  "approvals/ApprovalDetail (no-send gate-действия)": [
    {"id":"btn_defer","gated":true,"how":"enabled=!submitting; postponeFollowup; постоянный баннер send_disabled; 409→reload"},
    {"id":"btn_reject","gated":true,"how":"enabled=!submitting; setLeadStatus(rejected) через gate; no-send"}
  ],
  "settings + auth": [
    {"id":"btn_unpair","gated":false,"how":"⚠ НЕОБРАТИМО (сброс токена сопряжения) с одного тапа, БЕЗ диалога подтверждения — единственное опасное действие без какого-либо гейта"},
    {"id":"btn_pair","gated":true,"how":"enabled=!pairing; валидация 6-значного кода; регистрирует устройство и сохраняет токен"}
  ]
}
```

## Ключевые выводы

Реальной отправки сообщений клиенту в release-рантайме практически нет: единственный путь — `btn_send_email` (miniaudit/LeadDetail), и он двухступенчатый плюс заблокирован на сервере в no-send режиме. Все коммерческие APPROVE/decision-операции меняют только внутренний статус или создают черновики-снимки; цена нигде не редактируется владельцем (берётся из snapshot каталога); счета ограничены статусом ЧЕРНОВИК. Из 23 DANGEROUS-контролов 22 гейтятся (precondition + диалог + revision-guard, либо серверная блокировка).

Два момента требуют внимания владельца:
- `btn_unpair` (settings/SettingsScreen.kt:52) — необратимая отвязка устройства срабатывает с первого тапа без диалога подтверждения. Единственное опасное действие совсем без гейта.
- `autopilot_*` (reliability) и `push_switch_enabled` — пишут на сервер без диалога подтверждения (полагаются только на флаг busy и серверные блокировки). У `push_switch_*` к тому же отсутствует `testTag`.

Качество тест-тегов: ~110 контролов без `testTag` — почти все кнопки `Назад`/`Обновить`/`повтор`, кнопки диалогов `Отмена`/`Закрыть`, и весь экран Push + theme-чипы в Settings. Это слепые зоны для UI-автотестов.
agentId: a900af04907b5d241 (use SendMessage with to: 'a900af04907b5d241' to continue this agent)
<usage>subagent_tokens: 160774
tool_uses: 11
duration_ms: 2083874</usage>
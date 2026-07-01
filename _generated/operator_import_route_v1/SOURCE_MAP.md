# Operator Import Route Source Map

SESSION_NAME=OPERATOR_IMPORT_ROUTE_AND_REAL_LEADS_PRE_SEND_RESUME_V1
STATUS=PASS

## Source Map

EXISTING_INPUT_SCREEN_FOUND=YES
INPUT_SCREEN_FILE=apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/sales/WorkingSalesMvpScreen.kt
CURRENT_ROUTE=working_sales_mvp
CURRENT_ROUTE_FILE=apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/MaterControllerRoot.kt

WHY_NOT_REACHABLE_BEFORE=The route `working_sales_mvp` previously opened `PilotManualSalesCockpitScreen`, a demo-only cockpit without real lead input fields.

MINIMAL_FIX=Route `working_sales_mvp` and `pilot/lead`, `pilot/qualify`, `pilot/draft`, `pilot/qa` to `WorkingSalesMvpScreen`; add a local operator import panel that reads runtime-only JSON from app external files and populates in-memory fields.

## Implemented Route Contract

OPERATOR_IMPORT_ROUTE_STATUS=PASS
IMPORT_UI_TEST_TAG=operator_import_route
IMPORT_BUTTON_TEST_TAG=operator_import_load
IMPORT_PREVIOUS_TEST_TAG=operator_import_previous
IMPORT_NEXT_TEST_TAG=operator_import_next
STEP_TAGS=sales_step_lead,sales_step_qualify,sales_step_draft,sales_step_qa,sales_step_manual_send

## Safety Contract

OUTBOUND_SEND=NO
PAYMENT_ACTION=NO
PRODUCTION_WRITE=NO
PRODUCTION_FEATURE_FLAG=NO
BACKEND_DEPLOY=NO
REAL_LEAD_DATA_IN_GIT=NO
REAL_CONTACT_DATA_IN_GIT=NO

# STOP All Agents Contract

Status: foundation v1 contract.

## Commands

- `STOP_ALL_AGENTS`
- `OUTBOUND_OFF`
- `PRODUCTION_WRITE_OFF`
- `PAYMENTS_OFF`
- `BROWSER_ACTIONS_OFF`
- `REVOKE_ACTIVE_APPROVALS`

## Required Behavior

STOP must:

- block new risky tasks;
- cancel or pause active tool calls where possible;
- revoke temporary credentials where runtime support exists;
- block sends;
- disable production writes;
- disable payment actions;
- disable browser actions;
- checkpoint active workflows;
- show what was stopped.

## Interface Availability

STOP must be conceptually available through Android, Web, Telegram reserve channel, and local emergency command.

## Foundation Boundary

This document defines the contract only. It does not implement production STOP runtime, process control, credential revocation, or service orchestration.

"""Actionable, non-bypassing recovery plan for 100% of unresolved D sources.

This is not a second crawler. It preserves every blocked/social/unread source
and identifies a lawful next action, while the primary scanner keeps attempting
all 12 communes. Never turn a failed HTTP request into zero job postings.
"""
from __future__ import annotations

from collections import Counter
from urllib.parse import urlsplit

from motor_d_source_registry import COMMUNES


def recovery_category(source):
    status=source.get("status")
    if status=="requires_specialized_reader":
        return ("specialized_reader",1,
                "Reconcile verified employer/ATS browser or structured feed; never assume empty HTML means zero jobs.")
    if status=="needs_territorial_filter":
        return ("regional_query",2,
                "Validate individual search filters for all applicable communes, then verify original jobs.")
    if status=="blocked_or_failed":
        host=(urlsplit(str(source.get("url") or "")).hostname or "").lower()
        if host in ("cl.indeed.com","cl.computrabajo.com"):
            return ("restricted_job_portal",4,
                    "Keep the blocked query visible; use public employer ATS and permitted local job-board indexes as additional sources. No access-control bypass.")
        return ("failed_public_source",3,
                "Check public official equivalent, RSS or authorized API; record HTTP failure and retry via normal public access.")
    if status=="requires_authorized_reader":
        return ("social_reference",5,
                "Find official municipality/OMIL site or authorized social API/feed; keep this account unresolved until evidence is readable.")
    if status=="unvisited":
        return ("unvisited",0,
                "Schedule in the next full scan. Do not certify this commune or source as covered.")
    raise ValueError("unexpected_unresolved_source_status:"+str(status))


def build_recovery_queue(inventory,as_of,performance=None):
    """One item per pending source, sorted by actionable recovery priority."""
    if not isinstance(inventory,dict) or set(inventory.get("per_commune",{}))!=set(COMMUNES):
        raise ValueError("incomplete_12_commune_inventory")
    records=inventory.get("pending")
    if not isinstance(records,list) or inventory.get("unresolved_total")!=len(records):
        raise ValueError("recovery_roster_does_not_match_scan")
    result=[];ids=set()
    for item in records:
        if not isinstance(item,dict):
            raise ValueError("invalid_recovery_source")
        identifier=item.get("id")
        if not identifier or identifier in ids:
            raise ValueError("missing_or_duplicate_source_id")
        ids.add(identifier)
        towns=item.get("communes")
        if not isinstance(towns,list) or not towns or any(t not in COMMUNES for t in towns):
            raise ValueError("unmapped_source_commune")
        group,tier,action=recovery_category(item)
        performance_row=(performance or {}).get(identifier,{})
        result.append({
            "id":identifier,"name":item.get("name"),
            "url":item.get("url"),"communes":towns,
            "status":item["status"],
            "recovery_group":group,"priority_tier":tier,
            "previously_verified_job_count":max(0,int(performance_row.get("ready",0))),
            "next_action":action,
            "recovered":False,
        })
    result.sort(key=lambda x:(x["priority_tier"],-x["previously_verified_job_count"],x["id"]))
    counts=dict(sorted(Counter(x["recovery_group"] for x in result).items()))
    per_commune={
        town:{"pending":sum(town in row["communes"] for row in result),
              "high_priority":sum(town in row["communes"] and row["priority_tier"]<=2 for row in result)}
        for town in COMMUNES
    }
    return {
        "schema_version":1,
        "source_scan_date":as_of,
        "registered_total":inventory["registered_total"],
        "total_pending":len(result),
        "group_counts":counts,
        "all_sources_preserved":len(result)==inventory["unresolved_total"],
        "no_blocked_or_unread_source_claimed_recovered":True,
        "per_commune":per_commune,
        "tasks":result,
    }

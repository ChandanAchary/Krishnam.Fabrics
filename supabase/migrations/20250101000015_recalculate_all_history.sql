-- =============================================================================
-- Krishnam HRMS — One-time bulk recalculation of every existing salary row
-- =============================================================================
-- Every monthly_salaries row computed before migrations 20250101000012–14
-- landed is still holding stale calculated_salary/advance_deducted/net_salary
-- values from whichever bug was active when it was last touched (net_salary
-- frozen at 0, advance sourced from the old single labourers.advance field,
-- etc.). The calculation logic itself is now correct; this migration simply
-- re-runs it against every existing row so displayed figures catch up.
--
-- Safety / no data loss:
--   - Only recalculates rows that ALREADY exist in monthly_salaries — no new
--     labourers, attendance, or advance records are created or removed
--     (except the normal, expected carry-forward side effect described in
--     migration 013, which only ever adds/adjusts a system-tagged advance
--     row and never deletes user-entered data).
--   - recalculate_monthly_salary() never touches payment_status, paid_on,
--     paid_amount, payment_method, or payment_reference — payment history
--     is completely untouched (BR-05: payment is independent of recalc).
--   - LOCKED months are skipped entirely and left exactly as they are —
--     unlock them via the Salary page and click "Recalculate" if you want
--     a locked/paid month's figures corrected too; this migration will not
--     touch locked data.
--   - Each row is recalculated in its own sub-block. If an individual row
--     can't be recalculated (e.g. its next month is locked, which blocks
--     the automatic carry-forward described in migration 013), that one
--     row is skipped with a WARNING in the migration log instead of
--     aborting the whole bulk fix.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  v_ok    INT := 0;
  v_skip  INT := 0;
BEGIN
  FOR r IN
    SELECT ms.labourer_id, ms.month, ms.year
    FROM public.monthly_salaries ms
    WHERE NOT EXISTS (
      SELECT 1 FROM public.month_locks ml
      WHERE ml.month = ms.month AND ml.year = ms.year AND ml.is_locked = TRUE
    )
    ORDER BY ms.labourer_id, ms.year, ms.month
  LOOP
    BEGIN
      PERFORM public.recalculate_monthly_salary(
        r.labourer_id, r.month, r.year, 'bulk_fix_migration_015', FALSE
      );
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skip := v_skip + 1;
      RAISE WARNING 'Skipped recalculation for labourer % (%-%): %', r.labourer_id, r.year, r.month, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Bulk recalculation complete: % row(s) fixed, % row(s) skipped (see warnings above for why).', v_ok, v_skip;
END $$;

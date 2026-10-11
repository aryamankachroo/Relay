-- Demo requests for the backend. Run after setup.sql.
-- Run it again any time to reset REQUESTS to this starting state.
--
-- Two neighbors already need a drill, on the Friday and Sunday around the
-- coming Saturday. When Avery asks for a drill on Saturday there are three
-- households. That is the shared need: $60 x 3 = $180 alone, $60 shared.
-- Jordan and Sam also offer 12 and 8 notebooks. Avery asking for 20
-- notebooks fills in two parts.
-- Windows are 09:00 to 18:00 UTC like the backend extractor.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE RELAY_WH;
USE SCHEMA RELAY.APP;

TRUNCATE TABLE REQUESTS;

INSERT INTO REQUESTS
    (ID, RESIDENT_ID, KIND, RAW_TEXT, CATALOG_ITEM, QUANTITY, AREA, WINDOW_START, WINDOW_END, STATUS, CREATED_AT)
SELECT
    v.column1, v.column2, v.column3, v.column4, v.column5, v.column6, NULL,
    TO_TIMESTAMP_TZ(TO_VARCHAR(DATEADD(day, v.column7, d.sat), 'YYYY-MM-DD') || ' 09:00:00 +00:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'),
    TO_TIMESTAMP_TZ(TO_VARCHAR(DATEADD(day, v.column7, d.sat), 'YYYY-MM-DD') || ' 18:00:00 +00:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'),
    'open',
    CURRENT_TIMESTAMP()
FROM (VALUES
    ('seed-need-drill-sam',    'sam',    'need', 'I need a drill Friday', 'drill', 1, -1),
    ('seed-need-drill-jordan', 'jordan', 'need', 'I need a drill Sunday', 'drill', 1,  1)
) v
CROSS JOIN (
    SELECT DATEADD(
        day,
        MOD(6 - DAYOFWEEKISO(TO_DATE(CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP()))) + 7, 7),
        TO_DATE(CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP()))
    ) AS sat
) d;

INSERT INTO REQUESTS
    (ID, RESIDENT_ID, KIND, RAW_TEXT, CATALOG_ITEM, QUANTITY, AREA, WINDOW_START, WINDOW_END, STATUS, CREATED_AT)
SELECT
    column1, column2, 'offer', column3, 'notebooks', column4, NULL, NULL, NULL, 'open', CURRENT_TIMESTAMP()
FROM (VALUES
    ('seed-offer-notebooks-jordan', 'jordan', 'I have 12 notebooks to give away', 12),
    ('seed-offer-notebooks-sam',    'sam',    'I have 8 notebooks',               8)
);

-- Check: 4 open rows. Drill needs fall on a Friday and a Sunday.
SELECT ID, RESIDENT_ID, KIND, CATALOG_ITEM, QUANTITY, WINDOW_START, WINDOW_END, STATUS
FROM RELAY.APP.REQUESTS
ORDER BY ID;

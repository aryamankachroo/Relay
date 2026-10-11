-- Relay backend tables for Snowflake.
-- Run once in a Snowsight worksheet (Run all). Needs the RELAY database,
-- the RELAY_WH warehouse and the RELAY_APP role from the first setup script.
-- Then run seed_requests.sql.
--
-- Backend .env values for these tables:
--   SNOWFLAKE_WAREHOUSE=RELAY_WH
--   SNOWFLAKE_DATABASE=RELAY
--   SNOWFLAKE_SCHEMA=APP
--   SNOWFLAKE_ROLE=RELAY_APP

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE RELAY_WH;
USE DATABASE RELAY;
CREATE SCHEMA IF NOT EXISTS APP;
USE SCHEMA RELAY.APP;

-- Columns match INVENTORY_SQL in app/snowflake_store.py.
CREATE OR REPLACE TABLE INVENTORY (
    RESIDENT_ID       VARCHAR      NOT NULL,
    RESIDENT_NAME     VARCHAR      NOT NULL,
    X                 NUMBER(6,0)  NOT NULL,
    Y                 NUMBER(6,0)  NOT NULL,
    CATALOG_ITEM      VARCHAR      NOT NULL,  -- free label, matched to the catalog by alias
    QUANTITY          NUMBER(6,0)  NOT NULL DEFAULT 1,
    WILLING_TO_LEND   BOOLEAN      NOT NULL DEFAULT TRUE,
    CONDITION_NOTE    VARCHAR,
    AVAILABLE_WINDOWS VARIANT                 -- [["start ISO","end ISO"], ...] in UTC
);

-- Columns match REQUEST_INSERT_SQL in app/snowflake_store.py.
-- CATALOG_ITEM here is the catalog id, such as drill or notebooks.
CREATE OR REPLACE TABLE REQUESTS (
    ID            VARCHAR      NOT NULL,
    RESIDENT_ID   VARCHAR      NOT NULL,
    KIND          VARCHAR      NOT NULL,      -- need | offer | borrow
    RAW_TEXT      VARCHAR,
    CATALOG_ITEM  VARCHAR      NOT NULL,
    QUANTITY      NUMBER(6,0)  NOT NULL,
    AREA          VARCHAR,
    WINDOW_START  TIMESTAMP_TZ,
    WINDOW_END    TIMESTAMP_TZ,
    STATUS        VARCHAR      NOT NULL,      -- open | matched | closed
    CREATED_AT    TIMESTAMP_TZ
);

-- Cast. Coordinates are Manhattan blocks, the backend limit is 25.
-- Avery sits at 0,0 like the backend seed.
-- Noor is 40 blocks away, so nobody near Avery owns a drill and drill
-- demand becomes a shared need.
-- Riley's laser level opens a week from now, so a weekend project this
-- weekend skips it and next weekend finds it.
-- Sam's ladder is not for lending.
-- Pressure washer is not in the catalog on purpose.
INSERT INTO INVENTORY
SELECT
    v.column1, v.column2, v.column3, v.column4, v.column5, v.column6, v.column7, v.column8,
    IFF(v.column9 = 'later', w.later_windows, w.open_windows)
FROM (VALUES
    ('avery',  'Avery Moss',  0, 0, 'Tape measure',     1, TRUE,  '25 ft, locks, a little scuffed',   'open'),
    ('jordan', 'Jordan Lee',  2, 1, 'Level',            1, TRUE,  '9 inch torpedo level, accurate',   'open'),
    ('jordan', 'Jordan Lee',  2, 1, 'Hand saw',         1, TRUE,  'Sharp, 15 inch blade',             'open'),
    ('jordan', 'Jordan Lee',  2, 1, 'Bar clamps',       4, TRUE,  'Four 12 inch clamps',              'open'),
    ('jordan', 'Jordan Lee',  2, 1, 'Pressure washer',  1, TRUE,  'Electric, 1800 PSI',               'open'),
    ('sam',    'Sam Ortiz',   3, 3, 'Orbital sander',   1, TRUE,  'Fresh pads, five inch',            'open'),
    ('sam',    'Sam Ortiz',   3, 3, 'Circular saw',     1, TRUE,  '7 1/4 inch blade, corded',         'open'),
    ('sam',    'Sam Ortiz',   3, 3, 'Step ladder',      1, FALSE, 'Heavy, not lending',               'open'),
    ('riley',  'Riley Park',  5, 2, 'Laser level',      1, TRUE,  'Self leveling, needs two AA',      'later'),
    ('riley',  'Riley Park',  5, 2, 'Tape measure',     2, TRUE,  '25 ft',                            'open'),
    ('riley',  'Riley Park',  5, 2, 'Quick grip clamps',2, TRUE,  'Six inch',                        'open'),
    ('noor',   'Noor Haddad', 40, 0, 'Cordless drill',  1, TRUE,  'Two batteries and a charger',      'open')
) v
CROSS JOIN (
    SELECT
        ARRAY_CONSTRUCT(ARRAY_CONSTRUCT(
            TO_VARCHAR(DATEADD(day, -2, d.today), 'YYYY-MM-DD') || 'T00:00:00+00:00',
            TO_VARCHAR(DATEADD(day, 21, d.today), 'YYYY-MM-DD') || 'T23:59:59+00:00'
        )) AS open_windows,
        ARRAY_CONSTRUCT(ARRAY_CONSTRUCT(
            TO_VARCHAR(DATEADD(day, 7, d.today), 'YYYY-MM-DD') || 'T00:00:00+00:00',
            TO_VARCHAR(DATEADD(day, 35, d.today), 'YYYY-MM-DD') || 'T23:59:59+00:00'
        )) AS later_windows
    FROM (SELECT TO_DATE(CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())) AS today) d
) w;

GRANT USAGE ON SCHEMA RELAY.APP TO ROLE RELAY_APP;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA RELAY.APP TO ROLE RELAY_APP;
GRANT SELECT, INSERT, UPDATE, DELETE ON FUTURE TABLES IN SCHEMA RELAY.APP TO ROLE RELAY_APP;

-- Check: 12 inventory rows, 0 requests until you run seed_requests.sql.
SELECT
    (SELECT COUNT(*) FROM RELAY.APP.INVENTORY) AS inventory_rows,
    (SELECT COUNT(*) FROM RELAY.APP.REQUESTS)  AS request_rows;

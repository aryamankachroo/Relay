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
    INVENTORY_ID      VARCHAR,
    RESIDENT_ID       VARCHAR      NOT NULL,
    RESIDENT_NAME     VARCHAR      NOT NULL,
    X                 NUMBER(6,0)  NOT NULL,
    Y                 NUMBER(6,0)  NOT NULL,
    CATALOG_ITEM      VARCHAR      NOT NULL,  -- free label, matched to the catalog by alias
    QUANTITY          NUMBER(6,0)  NOT NULL DEFAULT 1,
    WILLING_TO_LEND   BOOLEAN      NOT NULL DEFAULT TRUE,
    CONDITION_NOTE    VARCHAR,
    AVAILABLE_WINDOWS VARIANT,                -- [["start ISO","end ISO"], ...] in UTC
    CATEGORY          VARCHAR,
    CONDITION         VARCHAR
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
-- Avery sits at 0,0 like the backend seed and keeps a small real shelf:
-- a tape measure, spare notebooks, and a ladder neighbors can borrow.
-- Nobody on the block owns a drill. Noor does, 40 blocks away, so a drill
-- request becomes a shared purchase.
-- Riley's laser level opens a week from now, so a project this weekend
-- skips it. Sam's ladder stays home. The pressure washer is not in the
-- catalog on purpose.
-- Maya, Chris, Priya, and Elena live on the same streets and lend the
-- tools a weekend project actually needs.
INSERT INTO INVENTORY
SELECT
    v.column1, v.column2, v.column3, v.column4, v.column5, v.column6, v.column7, v.column8,
    IFF(v.column9 = 'later', w.later_windows, w.open_windows)
FROM (VALUES
    ('avery',  'Avery Moss',    0, 0, 'Tape measure',      1,  TRUE,  '25 ft, locks, a little scuffed',  'open'),
    ('avery',  'Avery Moss',    0, 0, 'Notebooks',         6,  TRUE,  'College ruled, leftover pack',    'open'),
    ('avery',  'Avery Moss',    0, 0, 'Step ladder',       1,  TRUE,  '6 ft, folds flat',                'open'),
    ('jordan', 'Jordan Lee',    2, 1, 'Level',             1,  TRUE,  '9 inch torpedo level, accurate',  'open'),
    ('jordan', 'Jordan Lee',    2, 1, 'Hand saw',          1,  TRUE,  'Sharp, 15 inch blade',            'open'),
    ('jordan', 'Jordan Lee',    2, 1, 'Bar clamps',        4,  TRUE,  'Four 12 inch clamps',             'open'),
    ('jordan', 'Jordan Lee',    2, 1, 'Pressure washer',   1,  TRUE,  'Electric, 1800 PSI',              'open'),
    ('sam',    'Sam Ortiz',     3, 3, 'Orbital sander',    1,  TRUE,  'Fresh pads, five inch',           'open'),
    ('sam',    'Sam Ortiz',     3, 3, 'Circular saw',      1,  TRUE,  '7 1/4 inch blade, corded',        'open'),
    ('sam',    'Sam Ortiz',     3, 3, 'Step ladder',       1,  FALSE, 'Heavy, not lending',              'open'),
    ('riley',  'Riley Park',    5, 2, 'Laser level',       1,  TRUE,  'Self leveling, needs two AA',     'later'),
    ('riley',  'Riley Park',    5, 2, 'Tape measure',      2,  TRUE,  '25 ft',                           'open'),
    ('riley',  'Riley Park',    5, 2, 'Quick grip clamps', 2,  TRUE,  'Six inch',                        'open'),
    ('maya',   'Maya Chen',     1, 4, 'Hand saw',          1,  TRUE,  'Pull saw, fine teeth',            'open'),
    ('maya',   'Maya Chen',     1, 4, 'Bar clamps',        2,  TRUE,  'Two 6 inch clamps',               'open'),
    ('chris',  'Chris Nguyen',  4, 1, 'Orbital sander',    1,  TRUE,  'Cordless, one battery',           'open'),
    ('chris',  'Chris Nguyen',  4, 1, 'Tape measure',      1,  TRUE,  '16 ft pocket tape',               'open'),
    ('priya',  'Priya Shah',    6, 4, 'Level',             1,  TRUE,  '24 inch box level',               'open'),
    ('priya',  'Priya Shah',    6, 4, 'Quick grip clamps', 2,  TRUE,  '12 inch, one-handed',             'open'),
    ('elena',  'Elena Brooks',  8, 2, 'Circular saw',      1,  TRUE,  'Cordless, 6 1/2 inch blade',      'open'),
    ('elena',  'Elena Brooks',  8, 2, 'Notebooks',         10, TRUE,  'Composition books, unused',       'open'),
    ('noor',   'Noor Haddad',   40, 0, 'Cordless drill',   1,  TRUE,  'Two batteries and a charger',     'open'),
    ('luis',   'Luis Alvarez',  7, 3, 'Garden hose',      1,  TRUE,  '50 ft, brass fittings',           'open'),
    ('luis',   'Luis Alvarez',  7, 3, 'Soccer ball',      2,  TRUE,  'Size 5, one scuffed',             'open'),
    ('nia',    'Nia Patel',     2, 5, 'Folding table',    1,  TRUE,  '6 ft, seats eight',               'open'),
    ('nia',    'Nia Patel',     2, 5, 'Mixing bowl',      3,  TRUE,  'Stainless, nested set',           'open'),
    ('owen',   'Owen Blake',    1, 2, 'Extension cord',   1,  TRUE,  '25 ft, outdoor rated',            'open'),
    ('owen',   'Owen Blake',    1, 2, 'Hedge trimmer',    1,  TRUE,  'Corded, sharp',                   'open'),
    ('maya',   'Maya Chen',     1, 4, 'Garden hose',      1,  TRUE,  '25 ft, nozzle included',          'open')
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

CREATE TABLE IF NOT EXISTS RESIDENTS (
    CLERK_USER_ID VARCHAR NOT NULL,
    NAME          VARCHAR NOT NULL,
    EMAIL         VARCHAR,
    INITIALS      VARCHAR,
    STREET        VARCHAR,
    ASSIGNED_RESIDENT_ID VARCHAR,
    UPDATED_AT    TIMESTAMP_TZ
);

-- Check: 22 inventory rows, 0 requests until you run seed_requests.sql.
SELECT
    (SELECT COUNT(*) FROM RELAY.APP.INVENTORY) AS inventory_rows,
    (SELECT COUNT(*) FROM RELAY.APP.REQUESTS)  AS request_rows;

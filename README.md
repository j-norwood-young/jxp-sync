# jxp-sync

Syncs JXP databases to Sql-based databases... live!

## Setup

MySql test setup:
```sql
CREATE DATABASE test;
CREATE USER test@localhost IDENTIFIED BY "test123";
GRANT ALL PRIVILEGES ON test.* TO test@localhost;
FLUSH PRIVILEGES;
```

## Usage

`env NODE_ENV=development node index.js --collections balance booking checkin discount invoice ledger license lineitem location membership organisation product room space transaction user wallet -s -u -d`

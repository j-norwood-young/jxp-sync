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

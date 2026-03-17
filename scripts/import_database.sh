#!/bin/bash
# Import MongoDB database from JSON files

IMPORT_DIR="./database_export"
DB_NAME="gjc_crm"

mongoimport --db=$DB_NAME --collection=users --file=$IMPORT_DIR/users.json --jsonArray
mongoimport --db=$DB_NAME --collection=companies --file=$IMPORT_DIR/companies.json --jsonArray
mongoimport --db=$DB_NAME --collection=candidates --file=$IMPORT_DIR/candidates.json --jsonArray
mongoimport --db=$DB_NAME --collection=immigration_cases --file=$IMPORT_DIR/immigration_cases.json --jsonArray
mongoimport --db=$DB_NAME --collection=pipeline --file=$IMPORT_DIR/pipeline.json --jsonArray

echo "Database imported from $IMPORT_DIR"

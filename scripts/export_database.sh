#!/bin/bash
# Export MongoDB database to JSON files

EXPORT_DIR="./database_export"
DB_NAME="gjc_crm"

mkdir -p $EXPORT_DIR

mongoexport --db=$DB_NAME --collection=users --out=$EXPORT_DIR/users.json
mongoexport --db=$DB_NAME --collection=companies --out=$EXPORT_DIR/companies.json
mongoexport --db=$DB_NAME --collection=candidates --out=$EXPORT_DIR/candidates.json
mongoexport --db=$DB_NAME --collection=immigration_cases --out=$EXPORT_DIR/immigration_cases.json
mongoexport --db=$DB_NAME --collection=pipeline --out=$EXPORT_DIR/pipeline.json

echo "Database exported to $EXPORT_DIR"

#!/bin/bash
# Import Database - GJC CRM (Linux/Mac)

echo ""
echo "============================================"
echo "   GJC AI-CRM - Import Baza de Date"
echo "============================================"
echo ""

DB_NAME="gjc_crm"
IMPORT_DIR="../database_export"

echo "Importare colectii in baza de date '$DB_NAME'..."
echo ""

echo "[1/6] Import users..."
mongoimport --db=$DB_NAME --collection=users --file=$IMPORT_DIR/users.json --jsonArray --drop

echo "[2/6] Import companies..."
mongoimport --db=$DB_NAME --collection=companies --file=$IMPORT_DIR/companies.json --jsonArray --drop

echo "[3/6] Import candidates..."
mongoimport --db=$DB_NAME --collection=candidates --file=$IMPORT_DIR/candidates.json --jsonArray --drop

echo "[4/6] Import immigration_cases..."
mongoimport --db=$DB_NAME --collection=immigration_cases --file=$IMPORT_DIR/immigration_cases.json --jsonArray --drop

echo "[5/6] Import pipeline..."
mongoimport --db=$DB_NAME --collection=pipeline --file=$IMPORT_DIR/pipeline.json --jsonArray --drop

echo "[6/6] Import jobs..."
if [ -f "$IMPORT_DIR/jobs.json" ]; then
    mongoimport --db=$DB_NAME --collection=jobs --file=$IMPORT_DIR/jobs.json --jsonArray --drop
else
    echo "[SKIP] jobs.json nu exista"
fi

echo ""
echo "============================================"
echo "   IMPORT COMPLET!"
echo "============================================"
echo ""

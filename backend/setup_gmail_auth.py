"""
Script de autorizare Gmail - rulat O SINGURA DATA
Deschide browserul pentru a da permisiunea CRM-ului sa citeasca emailurile
"""

import sys
import os
from pathlib import Path

ROOT_DIR = Path(__file__).parent

print("=" * 60)
print("GJC CRM - Autorizare Gmail")
print("=" * 60)
print()
print("Acest script va deschide browserul pentru a autoriza")
print("CRM-ul sa citeasca emailurile tale de la IGI.")
print()
print("IMPORTANT: Logheza-te cu contul: office.kerljobsro@gmail.com")
print()

credentials_file = ROOT_DIR / 'credentials.json'
if not credentials_file.exists():
    print("EROARE: Fisierul credentials.json nu a fost gasit!")
    print(f"Pune fisierul in: {ROOT_DIR}")
    sys.exit(1)

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

    print("Se deschide browserul pentru autorizare...")
    print("(Daca nu se deschide automat, copiaza link-ul afisat in browser)")
    print()

    flow = InstalledAppFlow.from_client_secrets_file(
        str(credentials_file), SCOPES
    )
    creds = flow.run_local_server(port=0)

    # Salveaza token-ul
    token_file = ROOT_DIR / 'gmail_token.json'
    with open(token_file, 'w') as f:
        f.write(creds.to_json())

    print()
    print("=" * 60)
    print("AUTORIZARE REUSITA!")
    print("=" * 60)
    print(f"Token salvat in: {token_file}")
    print()

    # Test rapid - verifica ca functioneaza
    print("Testare conexiune Gmail...")
    service = build('gmail', 'v1', credentials=creds)
    profile = service.users().getProfile(userId='me').execute()
    email_address = profile.get('emailAddress', 'necunoscut')
    total_messages = profile.get('messagesTotal', 0)

    print(f"Conectat cu succes la: {email_address}")
    print(f"Total mesaje in inbox: {total_messages:,}")
    print()
    print("CRM-ul poate acum citi emailurile tale de la IGI!")
    print("Poti inchide aceasta fereastra.")

except ImportError:
    print("Instalare librarii necesare...")
    os.system(f'"{sys.executable}" -m pip install google-auth-oauthlib google-api-python-client -q')
    print("Ruleaza din nou scriptul!")
except Exception as e:
    print(f"Eroare: {e}")
    print()
    print("Solutii posibile:")
    print("1. Verifica ca fisierul credentials.json este corect")
    print("2. Asigura-te ca esti logat cu: office.kerljobsro@gmail.com")
    print("3. Accepta toate permisiunile cerute in browser")

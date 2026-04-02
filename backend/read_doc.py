import docx
import os

filepath = r'c:\Users\ioanp\OneDrive\Desktop\GJC CRM\backend\data\GJC_CRM_Propuneri_Modificare.docx'
print(f"File exists: {os.path.exists(filepath)}")
if not os.path.exists(filepath):
    print("Eroare: fisierul nu exista la calea absoluta.")
else:
    try:
        doc = docx.Document(filepath)
        text = [p.text for p in doc.paragraphs if p.text.strip()]
        print('\n'.join(text))
    except Exception as e:
        print(f"Eroare la citire: {e}")

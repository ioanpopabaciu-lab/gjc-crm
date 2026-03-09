"""
Generator PDF pentru documente GJC
- Angajament de plată
- Contract de mediere
- Ofertă fermă de angajare
"""

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from io import BytesIO
from datetime import datetime
import os

# Stiluri personalizate
def get_styles():
    styles = getSampleStyleSheet()
    
    styles.add(ParagraphStyle(
        name='TitleCenter',
        parent=styles['Title'],
        fontSize=16,
        alignment=TA_CENTER,
        spaceAfter=20,
        spaceBefore=10,
        textColor=colors.HexColor('#1e40af')
    ))
    
    styles.add(ParagraphStyle(
        name='SubTitle',
        parent=styles['Normal'],
        fontSize=12,
        alignment=TA_CENTER,
        spaceAfter=15,
        textColor=colors.HexColor('#374151')
    ))
    
    styles.add(ParagraphStyle(
        name='BodyJustify',
        parent=styles['Normal'],
        fontSize=11,
        alignment=TA_JUSTIFY,
        spaceAfter=10,
        leading=16
    ))
    
    styles.add(ParagraphStyle(
        name='BoldCenter',
        parent=styles['Normal'],
        fontSize=11,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold',
        spaceAfter=10
    ))
    
    styles.add(ParagraphStyle(
        name='SmallRight',
        parent=styles['Normal'],
        fontSize=9,
        alignment=TA_RIGHT,
        textColor=colors.HexColor('#6b7280')
    ))
    
    styles.add(ParagraphStyle(
        name='SectionTitle',
        parent=styles['Normal'],
        fontSize=12,
        fontName='Helvetica-Bold',
        spaceAfter=10,
        spaceBefore=15,
        textColor=colors.HexColor('#1e40af')
    ))
    
    return styles


def generate_angajament_plata(candidate_data: dict, company_data: dict, case_data: dict) -> BytesIO:
    """
    Generează PDF pentru Angajament de Plată
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = get_styles()
    elements = []
    
    # Header
    elements.append(Paragraph("GLOBAL JOBS CONSULTING S.R.L.", styles['TitleCenter']))
    elements.append(Paragraph("Agenție de Recrutare și Plasare Forță de Muncă", styles['SubTitle']))
    elements.append(Spacer(1, 10))
    
    # Titlu document
    elements.append(Paragraph("<b>ANGAJAMENT DE PLATĂ</b>", styles['TitleCenter']))
    elements.append(Spacer(1, 20))
    
    # Data și număr
    today = datetime.now().strftime("%d.%m.%Y")
    elements.append(Paragraph(f"Nr. ______ / Data: {today}", styles['SmallRight']))
    elements.append(Spacer(1, 20))
    
    # Corp document
    candidate_name = f"{candidate_data.get('first_name', '')} {candidate_data.get('last_name', '')}".strip()
    company_name = company_data.get('name', 'N/A')
    passport = candidate_data.get('passport_number', 'N/A')
    nationality = candidate_data.get('nationality', 'N/A')
    
    text1 = f"""
    Subsemnatul/a <b>{candidate_name}</b>, cetățean/ă <b>{nationality}</b>, 
    posesor/oare al pașaportului nr. <b>{passport}</b>, în calitate de beneficiar al 
    serviciilor de mediere și plasare forță de muncă oferite de GLOBAL JOBS CONSULTING S.R.L., 
    mă angajez prin prezenta să achit integral serviciile de recrutare și imigrare conform tarifelor 
    agreate, după cum urmează:
    """
    elements.append(Paragraph(text1, styles['BodyJustify']))
    elements.append(Spacer(1, 15))
    
    # Tabel servicii
    services_data = [
        ['Nr.', 'Descriere Serviciu', 'Valoare (EUR)'],
        ['1', 'Taxă recrutare și mediere', '500'],
        ['2', 'Taxă procesare documente IGI', '200'],
        ['3', 'Taxă depunere viză', '150'],
        ['4', 'Alte servicii administrative', '100'],
        ['', 'TOTAL', '950']
    ]
    
    table = Table(services_data, colWidths=[1.5*cm, 10*cm, 4*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f3f4f6')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 1), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 20))
    
    # Modalitate de plată
    elements.append(Paragraph("MODALITATE DE PLATĂ:", styles['SectionTitle']))
    
    text2 = """
    Plata se va efectua în tranșe, astfel:
    <br/>• <b>30%</b> din valoarea totală - la semnarea prezentului angajament
    <br/>• <b>40%</b> din valoarea totală - la obținerea avizului de muncă
    <br/>• <b>30%</b> din valoarea totală - la obținerea vizei de intrare în România
    <br/><br/>
    Plata se va efectua prin transfer bancar în contul:
    <br/><b>IBAN: RO49 BTRL 0000 0000 0000 0000</b>
    <br/><b>Banca: Banca Transilvania</b>
    <br/><b>Beneficiar: GLOBAL JOBS CONSULTING S.R.L.</b>
    """
    elements.append(Paragraph(text2, styles['BodyJustify']))
    elements.append(Spacer(1, 20))
    
    # Angajamente
    elements.append(Paragraph("ANGAJAMENTE:", styles['SectionTitle']))
    
    text3 = f"""
    Prin semnarea prezentului document, mă angajez:
    <br/>• Să furnizez toate documentele necesare procesului de imigrare în termenul stabilit
    <br/>• Să mă prezint la toate programările stabilite de agenție
    <br/>• Să respect contractul de muncă încheiat cu angajatorul <b>{company_name}</b>
    <br/>• Să achit integral sumele datorate conform graficului de plată
    <br/><br/>
    Înțeleg că nerespectarea acestor angajamente poate duce la încetarea serviciilor 
    de mediere și la pierderea sumelor achitate în avans.
    """
    elements.append(Paragraph(text3, styles['BodyJustify']))
    elements.append(Spacer(1, 40))
    
    # Semnături
    sig_data = [
        ['BENEFICIAR', 'GLOBAL JOBS CONSULTING S.R.L.'],
        [f'{candidate_name}', 'Reprezentant legal'],
        ['', ''],
        ['Semnătura: ________________', 'Semnătura: ________________'],
        ['Data: ________________', 'Data: ________________'],
    ]
    
    sig_table = Table(sig_data, colWidths=[7.5*cm, 7.5*cm])
    sig_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(sig_table)
    
    # Footer
    elements.append(Spacer(1, 30))
    elements.append(Paragraph(
        "Document generat automat de GJC AI-CRM • www.globaljobsconsulting.ro",
        styles['SmallRight']
    ))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer


def generate_contract_mediere(candidate_data: dict, company_data: dict, case_data: dict) -> BytesIO:
    """
    Generează PDF pentru Contract de Mediere
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = get_styles()
    elements = []
    
    # Header
    elements.append(Paragraph("GLOBAL JOBS CONSULTING S.R.L.", styles['TitleCenter']))
    elements.append(Paragraph("CUI: RO45678912 • J05/789/2020", styles['SubTitle']))
    elements.append(Spacer(1, 10))
    
    # Titlu document
    elements.append(Paragraph("<b>CONTRACT DE MEDIERE</b>", styles['TitleCenter']))
    elements.append(Paragraph("pentru servicii de recrutare și plasare forță de muncă", styles['SubTitle']))
    elements.append(Spacer(1, 15))
    
    # Data și număr
    today = datetime.now().strftime("%d.%m.%Y")
    elements.append(Paragraph(f"Nr. ______ / Data: {today}", styles['SmallRight']))
    elements.append(Spacer(1, 15))
    
    # Părțile contractante
    elements.append(Paragraph("PĂRȚILE CONTRACTANTE:", styles['SectionTitle']))
    
    candidate_name = f"{candidate_data.get('first_name', '')} {candidate_data.get('last_name', '')}".strip()
    company_name = company_data.get('name', 'N/A')
    company_cui = company_data.get('cui', 'N/A')
    passport = candidate_data.get('passport_number', 'N/A')
    nationality = candidate_data.get('nationality', 'N/A')
    
    text1 = f"""
    <b>1. GLOBAL JOBS CONSULTING S.R.L.</b>, cu sediul în Oradea, str. Republicii nr. 10, 
    județul Bihor, înregistrată la Registrul Comerțului sub nr. J05/789/2020, CUI RO45678912, 
    reprezentată legal prin Ioan Baciu - Administrator, în calitate de <b>MEDIATOR</b>,
    <br/><br/>
    <b>2. {candidate_name}</b>, cetățean {nationality}, posesor al pașaportului nr. {passport}, 
    în calitate de <b>BENEFICIAR</b>,
    <br/><br/>
    <b>3. {company_name}</b>, {f'CUI {company_cui}' if company_cui and company_cui != 'N/A' else ''}, 
    în calitate de <b>ANGAJATOR</b>,
    <br/><br/>
    au convenit încheierea prezentului contract de mediere, cu respectarea următoarelor clauze:
    """
    elements.append(Paragraph(text1, styles['BodyJustify']))
    elements.append(Spacer(1, 15))
    
    # Art. 1 - Obiectul contractului
    elements.append(Paragraph("Art. 1 - OBIECTUL CONTRACTULUI", styles['SectionTitle']))
    text2 = f"""
    Mediatorul se obligă să asigure servicii de recrutare, selecție și plasare a Beneficiarului 
    la Angajatorul <b>{company_name}</b>, pentru ocuparea unui post de muncă pe teritoriul României, 
    în conformitate cu legislația în vigoare privind angajarea cetățenilor străini.
    """
    elements.append(Paragraph(text2, styles['BodyJustify']))
    
    # Art. 2 - Obligațiile Mediatorului
    elements.append(Paragraph("Art. 2 - OBLIGAȚIILE MEDIATORULUI", styles['SectionTitle']))
    text3 = """
    Mediatorul se obligă:
    <br/>a) Să asigure consultanță și asistență în obținerea avizului de muncă
    <br/>b) Să asiste Beneficiarul în procesul de obținere a vizei de lungă ședere
    <br/>c) Să intermedieze relația dintre Beneficiar și Angajator
    <br/>d) Să informeze Beneficiarul cu privire la drepturile și obligațiile sale
    <br/>e) Să asigure traducerea documentelor necesare, dacă este cazul
    """
    elements.append(Paragraph(text3, styles['BodyJustify']))
    
    # Art. 3 - Obligațiile Beneficiarului
    elements.append(Paragraph("Art. 3 - OBLIGAȚIILE BENEFICIARULUI", styles['SectionTitle']))
    text4 = """
    Beneficiarul se obligă:
    <br/>a) Să furnizeze toate documentele solicitate în termenele stabilite
    <br/>b) Să se prezinte la toate programările stabilite de Mediator
    <br/>c) Să achite tarifele convenite conform Angajamentului de Plată
    <br/>d) Să respecte contractul individual de muncă încheiat cu Angajatorul
    <br/>e) Să informeze Mediatorul asupra oricăror modificări ale situației personale
    """
    elements.append(Paragraph(text4, styles['BodyJustify']))
    
    # Art. 4 - Obligațiile Angajatorului
    elements.append(Paragraph("Art. 4 - OBLIGAȚIILE ANGAJATORULUI", styles['SectionTitle']))
    text5 = """
    Angajatorul se obligă:
    <br/>a) Să asigure condițiile de muncă conform legislației în vigoare
    <br/>b) Să asigure cazarea Beneficiarului pe perioada contractului de muncă
    <br/>c) Să achite salariul convenit prin contractul individual de muncă
    <br/>d) Să respecte toate obligațiile legale privind angajarea cetățenilor străini
    """
    elements.append(Paragraph(text5, styles['BodyJustify']))
    
    # Art. 5 - Durata
    elements.append(Paragraph("Art. 5 - DURATA CONTRACTULUI", styles['SectionTitle']))
    text6 = """
    Prezentul contract intră în vigoare la data semnării și este valabil până la finalizarea 
    procesului de angajare a Beneficiarului sau până la încetarea raporturilor de muncă 
    dintre Beneficiar și Angajator, dar nu mai mult de 24 de luni.
    """
    elements.append(Paragraph(text6, styles['BodyJustify']))
    
    elements.append(Spacer(1, 30))
    
    # Semnături
    sig_data = [
        ['MEDIATOR', 'BENEFICIAR', 'ANGAJATOR'],
        ['GLOBAL JOBS CONSULTING', f'{candidate_name}', f'{company_name}'],
        ['', '', ''],
        ['Semnătura:', 'Semnătura:', 'Semnătura:'],
        ['________________', '________________', '________________'],
    ]
    
    sig_table = Table(sig_data, colWidths=[5*cm, 5*cm, 5*cm])
    sig_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(sig_table)
    
    # Footer
    elements.append(Spacer(1, 20))
    elements.append(Paragraph(
        f"Document generat automat de GJC AI-CRM • {today}",
        styles['SmallRight']
    ))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer


def generate_oferta_angajare(candidate_data: dict, company_data: dict, case_data: dict) -> BytesIO:
    """
    Generează PDF pentru Ofertă Fermă de Angajare
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = get_styles()
    elements = []
    
    # Header companie
    company_name = company_data.get('name', 'COMPANIE S.R.L.')
    company_cui = company_data.get('cui', '')
    company_city = company_data.get('city', 'România')
    
    elements.append(Paragraph(f"<b>{company_name}</b>", styles['TitleCenter']))
    if company_cui:
        elements.append(Paragraph(f"CUI: {company_cui}", styles['SubTitle']))
    elements.append(Paragraph(f"Localitatea: {company_city}", styles['SubTitle']))
    elements.append(Spacer(1, 20))
    
    # Titlu document
    elements.append(Paragraph("<b>OFERTĂ FERMĂ DE ANGAJARE</b>", styles['TitleCenter']))
    elements.append(Spacer(1, 20))
    
    # Data și număr
    today = datetime.now().strftime("%d.%m.%Y")
    elements.append(Paragraph(f"Nr. ______ / Data: {today}", styles['SmallRight']))
    elements.append(Spacer(1, 20))
    
    # Date candidat
    candidate_name = f"{candidate_data.get('first_name', '')} {candidate_data.get('last_name', '')}".strip()
    passport = candidate_data.get('passport_number', 'N/A')
    nationality = candidate_data.get('nationality', 'N/A')
    job_type = candidate_data.get('job_type', 'Muncitor necalificat')
    
    # Corp document
    text1 = f"""
    Societatea <b>{company_name}</b>, prin reprezentant legal, 
    înaintează prezenta ofertă fermă de angajare pentru:
    """
    elements.append(Paragraph(text1, styles['BodyJustify']))
    elements.append(Spacer(1, 15))
    
    # Date angajat
    elements.append(Paragraph("DATE CANDIDAT:", styles['SectionTitle']))
    
    candidate_info = [
        ['Nume și prenume:', candidate_name],
        ['Cetățenia:', nationality],
        ['Nr. Pașaport:', passport],
        ['Postul oferit:', job_type],
    ]
    
    info_table = Table(candidate_info, colWidths=[5*cm, 10*cm])
    info_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f9fafb')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 20))
    
    # Condiții de angajare
    elements.append(Paragraph("CONDIȚII DE ANGAJARE:", styles['SectionTitle']))
    
    conditions = [
        ['Tip contract:', 'Contract individual de muncă pe durată determinată'],
        ['Durată contract:', '12 luni, cu posibilitate de prelungire'],
        ['Program de lucru:', '8 ore/zi, 40 ore/săptămână'],
        ['Salariu brut lunar:', '4.000 RON'],
        ['Salariu net lunar:', 'aprox. 2.400 RON'],
        ['Cazare:', 'Asigurată de angajator'],
        ['Masă:', 'Parțial asigurată / tichet de masă'],
        ['Transport:', 'Asigurat de angajator'],
    ]
    
    cond_table = Table(conditions, colWidths=[5*cm, 10*cm])
    cond_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
    ]))
    elements.append(cond_table)
    elements.append(Spacer(1, 20))
    
    # Declarație
    text2 = f"""
    Prin prezenta, <b>{company_name}</b> declară că:
    <br/>
    <br/>• Își asumă responsabilitatea angajării candidatului menționat mai sus
    <br/>• Va respecta toate obligațiile legale privind angajarea cetățenilor străini
    <br/>• Va asigura condițiile de muncă și cazare specificate
    <br/>• Va colabora cu autoritățile competente pentru obținerea documentelor necesare
    <br/>
    <br/>Prezenta ofertă este valabilă 90 de zile de la data emiterii și constituie 
    document oficial pentru obținerea avizului de muncă.
    """
    elements.append(Paragraph(text2, styles['BodyJustify']))
    elements.append(Spacer(1, 40))
    
    # Semnătură angajator
    sig_data = [
        ['ANGAJATOR'],
        [company_name],
        [''],
        ['Reprezentant legal: ________________'],
        [''],
        ['Semnătura: ________________'],
        [''],
        ['Ștampila:'],
        [''],
        [''],
        ['Data: ________________'],
    ]
    
    sig_table = Table(sig_data, colWidths=[8*cm])
    sig_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(sig_table)
    
    # Footer
    elements.append(Spacer(1, 30))
    elements.append(Paragraph(
        f"Document generat pentru dosar IGI • GJC AI-CRM • {today}",
        styles['SmallRight']
    ))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

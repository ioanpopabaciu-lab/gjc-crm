import os

app_path = 'App.js'
with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

sections = content.split('// ===================== ')

modules_to_extract = {
    'IMMIGRATION MODULE': ('ImmigrationPage', "import React, { useState, useEffect, useCallback, useRef } from 'react';\nimport axios from 'axios';\nimport { FileText, Plus, ChevronRight, Eye, Trash2, X, AlertTriangle, Paperclip, Upload, Download, Globe, Building2, Briefcase, Mail, ChevronDown } from 'lucide-react';\nimport { API } from '../config';\nimport LoadingSpinner from '../components/LoadingSpinner';\n"),
    'PIPELINE MODULE': ('PipelinePage', "import React, { useState, useEffect, useCallback } from 'react';\nimport axios from 'axios';\nimport { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';\nimport { API } from '../config';\nimport LoadingSpinner from '../components/LoadingSpinner';\n"),
    'DOCUMENTS MODULE': ('DocumentsPage', "import React, { useState, useEffect, useCallback } from 'react';\nimport axios from 'axios';\nimport { FileText, Plus } from 'lucide-react';\nimport { API } from '../config';\nimport LoadingSpinner from '../components/LoadingSpinner';\n"),
    'REPORTS MODULE': ('ReportsPage', "import React, { useState, useEffect } from 'react';\nimport axios from 'axios';\nimport { BarChart3, Globe, TrendingUp, AlertTriangle, FileText } from 'lucide-react';\nimport { API } from '../config';\nimport LoadingSpinner from '../components/LoadingSpinner';\n"),
    'ALERTS MODULE': ('AlertsPage', "import React, { useState, useEffect, useCallback } from 'react';\nimport axios from 'axios';\nimport { Bell, Clock, AlertTriangle, RefreshCw, Eye, CheckCircle } from 'lucide-react';\nimport { API } from '../config';\nimport LoadingSpinner from '../components/LoadingSpinner';\n")
}

os.makedirs('pages', exist_ok=True)

for section in sections:
    if not section.strip(): continue
    lines = section.split('\n')
    header = lines[0].replace(' =====================', '').strip()
    
    if header in modules_to_extract:
        page_name, imports = modules_to_extract[header]
        body = '\n'.join(lines[1:]).strip()
        # Rename module to page name
        old_name = header.split()[0].capitalize() + 'Module'
        body = body.replace(f'const {old_name} =', f'const {page_name} =')
        
        full_content = f"{imports}\n{body}\n\nexport default {page_name};\n"
        
        with open(f"pages/{page_name}.js", "w", encoding="utf-8") as out:
            out.write(full_content)
        print(f"Extracted {page_name}")

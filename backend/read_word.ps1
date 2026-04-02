$word = New-Object -ComObject Word.Application
$doc = $word.Documents.Open("c:\Users\ioanp\OneDrive\Desktop\GJC CRM\backend\data\GJC_CRM_Propuneri_Modificare.docx", $false, $true)
$text = $doc.Content.Text
$doc.Close($false)
$word.Quit()
$text | Out-File -FilePath "c:\Users\ioanp\OneDrive\Desktop\GJC CRM\backend\propuneri.txt" -Encoding utf8

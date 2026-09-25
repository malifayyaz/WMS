import os
import re

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    parts = content.split("<Box sx={{ mt: 1, mb: 1, p: 1.5, border: '1px dashed', borderColor: 'primary.main', borderRadius: 1 }}>")
    
    if len(parts) == 1:
        return
        
    new_content = parts[0]
    
    for part in parts[1:]:
        match = re.search(r'([ \t]*)(</>)([ \t]*\n[ \t]*\)[ \t]*:[ \t]*\()', part)
        if match:
            spaces = match.group(1)
            replaced_part = part[:match.start()] + spaces + "</Box>\n" + spaces + "</>" + match.group(3) + part[match.end():]
            new_content += "<Box sx={{ mt: 1, mb: 1, p: 1.5, border: '1px dashed', borderColor: 'primary.main', borderRadius: 1 }}>" + replaced_part
        else:
            new_content += "<Box sx={{ mt: 1, mb: 1, p: 1.5, border: '1px dashed', borderColor: 'primary.main', borderRadius: 1 }}>" + part
            
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

fix_file("d:/Ali Fayaz Projects/WMS/frontend/src/pages/DailyBook.jsx")
fix_file("d:/Ali Fayaz Projects/WMS/frontend/src/pages/Expenses.jsx")
fix_file("d:/Ali Fayaz Projects/WMS/frontend/src/pages/PersonalPayments.jsx")
print("Done!")

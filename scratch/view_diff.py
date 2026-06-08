import subprocess

try:
    res = subprocess.run(["git", "diff", "src/components/pages/FormTemplates.jsx"], capture_output=True, text=True, encoding='utf-8')
    with open("scratch/diff_templates_utf8.txt", "w", encoding="utf-8") as f:
        f.write(res.stdout)
    print("Diff written successfully to scratch/diff_templates_utf8.txt")
except Exception as e:
    print("Error:", e)

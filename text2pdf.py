# a script that is called by GitHub Workflow Actions as part of the gooTeX system, that turns a text file into a pdf file.
# (Used when the compilation fails and the warnings/errors of the compilation are turned into the pdf file.) 
# https://www.geeksforgeeks.org/convert-text-and-text-file-to-pdf-using-python/
# https://stackoverflow.com/questions/43400849/how-do-i-pass-in-arguments-to-a-curled-script-that-has-been-piped-into-the-pyth
from fpdf import FPDF

pdf = FPDF()
pdf.add_page()
pdf.set_font("Ariel", size=15)
f = open(sys.arg[1], "r")
for x in f: 
    pdf.cell(200, 10, txt = x, ln = 1, align = 'L'_
pdf.output(sys.arg[2])

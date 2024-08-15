<img style="float: left;" src="https://github.com/user-attachments/assets/2a6b4c9d-e7f1-48bd-89c9-486153174ba2" height="100px">
<br><br>
<hr>
Stay turned for the first release of gooTeX at this repository!  <br>
<i>The release is targeted for no later than Aug 31, 2024. </i>
<br><br>
The release will consist of a Google Doc template (serves as the Latex editor of your manuscript) with a link to YouTube "how to" video to understand the features and how to use it. 
<br><br>
gooTeX is a latex compiler + editor. The editor utilizes a Google Doc, providing all the useful associated built-in features such as edit-tracking, ability to comment, a chat feature, etc. The Google Doc has an attached script that performs some basic latex linting, sets a sidebar that provides a searchable/clickable list of your .bib file, and opens up a separate browser tab window where the compiled latex pdf file is displayed and where the controls are located for performing compilation and error/warning inspection.   The attached script also provides some helpful features such as recognizing certain latex commenting characters to be automatically yellow-highlighted to grab colleagues' attention, and/or to appear as a marker in the document's outline for quick reference (for example, if one needed to mark a place in the manuscript to remind one where they were working and where they needed to return when they come back to the document.) <br><br>
Behind the scenes of gooTeX, the Google Doc clones the files in the Google Drive folder to a github repository and then triggers a github Workflow Actions to compile the latex file.  The Google Doc script waits for the compilation to complete, then copies the freshly-rendered pdf file to the Google Drive folder and displays in the pdf viewer browser tab.  If the compilation encountered a fatal error, the pdf will show the list of errors and warnings instead of the manuscript.  If the connection to github timed-out waiting for the compilation to complete in either success or failure, the pdf will instead show a connection and time-out error.  On the pdf viewer browser tab, a link to the full output from the compiler is provided, along with a link to the github repo and google drive folder. 
<br><br>
Every collaborator on the manuscript will have the paper cloned on their own github repository.

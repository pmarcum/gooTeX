<p><img style="float: left;" src="https://github.com/user-attachments/assets/2a6b4c9d-e7f1-48bd-89c9-486153174ba2" height="100px"></p>

$\textbf{\color{green}{gooTeX}}$ is a latex compiler + editor. The editor utilizes a Google Doc, providing all the useful associated built-in features such as edit-tracking, ability to comment, a chat feature, etc. The Google Doc has an attached script that performs some basic latex linting, sets a sidebar that provides a searchable/clickable list of your .bib file, and opens up a separate browser tab window where the compiled latex pdf file is displayed and where the controls are located for performing compilation and error/warning inspection.   The attached script also provides some helpful features such as recognizing certain latex commenting characters to be automatically yellow-highlighted to grab colleagues' attention, and/or to appear as a marker in the document's outline for quick reference (for example, if one needed to mark a place in the manuscript to remind one where they were working and where they needed to return when they come back to the document.)

Behind the scenes of $\textbf{\color{green}{gooTeX}}$, the Google Doc clones the files in the Google Drive folder to a github repository and then triggers a github Workflow Actions to compile the latex file.  The Google Doc script waits for the compilation to complete, then copies the freshly-rendered pdf file to the Google Drive folder and displays in the pdf viewer browser tab.  If the compilation encountered a fatal error, the pdf will show the list of errors and warnings instead of the manuscript.  If the connection to github timed-out waiting for the compilation to complete in either success or failure, the pdf will instead show a connection and time-out error.  On the pdf viewer browser tab, a link to the full output from the compiler is provided, along with a link to the github repo and google drive folder. 

Every collaborator on the manuscript will have the paper cloned on their own github repository. This approach has the advantage of allowing the user to perform the latex compilation in any manner they prefer using the github repository content, if they do not wish to rely on the pdf viewer (for example, one might save compilation+file transfer time by setting up a direct connection to the github repository and performing the compilation locally.) 

The below is a link to the $\textbf{\color{green}{gooTeX}}$ template (a Google Doc):
https://docs.google.com/document/d/1OX4gX1A2F9QsRknSIN9ed7jkZ9lxOZ46R1ZyF43mqrM/copy

If you hit the "Copy" button that appears when you follow the above link, a copy of the Google Doc template will appear at the top of your folder hierarchy, e.g., "My Drive" folder in your Google Drive. I recommend that you move the $\textbf{\color{green}{gooTeX}}$ template into a designated folder for the paper/proposal that you are working on. 

<b><i>I realize that you probably won't be able to do much at this point without a detailed how-to file.  An accompanying "how to" video or manual demonstrating how to install and use it is planned for release in the near future.</i></b>


           %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
           %%%          Thank you for your interest in gooTeX !          %%%
           %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Updates: ver 11252024 is the latest version

11/25/2024
- The first release of <b><i>gooTeX</i></b>  has been made! (but without accompanying "how-to-use" information, which is forthcoming).
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

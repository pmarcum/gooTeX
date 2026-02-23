import tkinter as tk
from tkinter import scrolledtext
import threading
import sys
from gootex import cli

class RedirectText:
    def __init__(self, text_widget):
        self.output = text_widget

    def write(self, string):
        self.output.insert(tk.END, string)
        self.output.see(tk.END)

    def flush(self):
        pass

def run_task(task_func):
    """Runs a CLI task in a separate thread to keep UI responsive."""
    def wrapper():
        try:
            task_func()
        except SystemExit as e:
            if e.code != 0:
                print("\n❌ Task Failed. Review logs above.")
        except Exception as e:
            print(f"\n⚠️ Unexpected Error: {str(e)}")
    
    threading.Thread(target=wrapper, daemon=True).start()

def run_gui():
    root = tk.Tk()
    root.title("gooTeX Local Compiler") # Updated Title
    root.geometry("700x550")

    # Project Identifier Label
    # This acts as the "Visual Handshake" to confirm the project
    project_label = tk.Label(root, text=f"Active Project: {cli.JOB_NAME}", 
                             font=("Helvetica", 10, "bold"), fg="#5f6368")
    project_label.pack(pady=(10, 0))

    # Log Window
    log_area = scrolledtext.ScrolledText(root, wrap=tk.WORD, height=20)
    log_area.pack(padx=10, pady=10, fill=tk.BOTH, expand=True)

    # Redirect output
    sys.stdout = RedirectText(log_area)
    sys.stderr = RedirectText(log_area)

    # Button Container
    btn_frame = tk.Frame(root)
    btn_frame.pack(pady=10)

    # Button 1: Compile
    tk.Button(btn_frame, text="🚀 Sync & Compile", 
              command=lambda: run_task(cli.compile_locally),
              bg="#4CAF50", fg="white", width=15, pady=5).pack(side=tk.LEFT, padx=5)

    # Button 2: Prepare Submission
    tk.Button(btn_frame, text="📦 Prepare Bundle", 
              command=lambda: run_task(cli.prepare_submission),
              bg="#2196F3", fg="white", width=15, pady=5).pack(side=tk.LEFT, padx=5)

    # Button 3: Open Browser
    tk.Button(btn_frame, text="🔗 Open Google Doc", 
              command=cli.open_in_browser, 
              bg="#f1f3f4", fg="black", width=18, pady=5).pack(side=tk.LEFT, padx=5)

    root.mainloop()

if __name__ == "__main__":
    run_gui()

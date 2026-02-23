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

def start_gui():
    root = tk.Tk()
    root.title("gooTeX Science Portal")
    root.geometry("700x500")

    # Log Window
    log_area = scrolledtext.ScrolledText(root, wrap=tk.WORD, height=20)
    log_area.pack(padx=10, pady=10, fill=tk.BOTH, expand=True)

    # Redirect stdout and stderr to the log window
    sys.stdout = RedirectText(log_area)
    sys.stderr = RedirectText(log_area)

    # Button Container (Frames the buttons side-by-side)
    btn_frame = tk.Frame(root)
    btn_frame.pack(pady=10)

    # Button 1: Compile
    compile_btn = tk.Button(
        btn_frame, 
        text="🚀 Sync & Compile PDF", 
        command=lambda: run_task(cli.compile_locally),
        bg="#4CAF50", fg="white", padx=10, pady=5
    )
    compile_btn.pack(side=tk.LEFT, padx=5)

    # Button 2: Prepare Submission
    submit_btn = tk.Button(
        btn_frame, 
        text="📦 Prepare Publisher Bundle", 
        command=lambda: run_task(cli.prepare_submission),
        bg="#2196F3", fg="white", padx=10, pady=5
    )
    submit_btn.pack(side=tk.LEFT, padx=5)

    root.mainloop()

if __name__ == "__main__":
    start_gui()

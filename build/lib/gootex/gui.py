import tkinter as tk
from tkinter import scrolledtext
import subprocess
import threading

def run_gui():
    def run_compilation():
        compile_btn.config(state=tk.DISABLED, text="Compiling...")
        log_box.delete(1.0, tk.END)
        log_box.insert(tk.END, "Initiating gooTeX compilation sequence...\n\n")
        
        def execute():
            try:
                # This now calls the registered system command instead of python3
                process = subprocess.Popen(
                    ["gootex"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True
                )
                
                for line in process.stdout:
                    log_box.insert(tk.END, line)
                    log_box.see(tk.END)
                
                process.wait()
                
                if process.returncode == 0:
                    log_box.insert(tk.END, "\n✅ Compilation Successful.")
                else:
                    log_box.insert(tk.END, "\n❌ Compilation Failed. Review logs above.")
                    
            except Exception as e:
                log_box.insert(tk.END, f"\n❌ System Error: {e}\nMake sure you are in the project folder with config.json.")
                
            finally:
                compile_btn.config(state=tk.NORMAL, text="Compile gooTeX")

        threading.Thread(target=execute, daemon=True).start()

    # --- Build the Window ---
    root = tk.Tk()
    root.title("gooTeX Control Panel")
    root.geometry("600x400")

    instructions = tk.Label(root, text="Press Compile to pull source and generate PDF.", pady=10)
    instructions.pack()

    compile_btn = tk.Button(root, text="Compile gooTeX", command=run_compilation, height=2, width=25, bg="lightblue")
    compile_btn.pack(pady=5)

    log_box = scrolledtext.ScrolledText(root, wrap=tk.WORD, width=70, height=15, bg="black", fg="lightgreen")
    log_box.pack(pady=10)

    root.mainloop()

if __name__ == '__main__':
    run_gui()

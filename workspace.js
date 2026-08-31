If they are separate polylines

If you have AutoCAD LT 2024 or newer on Windows, it supports AutoLISP, so a small “total length” command is the cleanest solution. Save this as TotalLength.lsp:

(defun c:TLEN (/ ss i obj total)
  (setq total 0.0)
  (if (setq ss (ssget '((0 . "LINE,ARC,LWPOLYLINE,POLYLINE,SPLINE"))))
    (progn
      (setq i 0)
      (repeat (sslength ss)
        (setq obj (vlax-ename->vla-object (ssname ss i)))
        (setq total
          (+ total
             (vlax-curve-getDistAtParam
               obj
               (vlax-curve-getEndParam obj))))
        (setq i (1+ i)))
      (princ (strcat "\nTOTAL LENGTH: " (rtos total 2 2)))
    )
  )
  (princ)
)

Then:

Type APPLOAD.
Load TotalLength.lsp.
Type TLEN.
Select the polylines and press Enter.

The total appears on the command line in your drawing’s units. If you have an older LT version, joining connected polylines is the simplest built-in option.

how do i save the script?;

Use Notepad:

Open Notepad.
Paste the entire script into it.
Click File → Save As.
Set Save as type to All files (.).

Name it exactly:

TotalLength.lsp

Set Encoding to ANSI or UTF-8.
Save it somewhere easy to find, such as your Desktop.

Make sure it did not save as TotalLength.lsp.txt. In File Explorer, you can check this by turning on View → Show → File name extensions.

Then in AutoCAD LT:

Type APPLOAD and press Enter.
Browse to TotalLength.lsp.
Select it and click Load.
Close the window.
Type TLEN and press Enter.
Select your polylines and press Enter.

If AutoCAD gives a security warning, move the file into a trusted folder listed under Options → Files → Trusted Locations, then load it again.

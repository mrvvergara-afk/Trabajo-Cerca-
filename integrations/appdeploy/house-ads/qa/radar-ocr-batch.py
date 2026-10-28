"""Free local OCR evidence. Never authorizes or sends a publication."""
import concurrent.futures, datetime as dt, importlib.util, json, time, threading, re
import fitz
from pathlib import Path
spec=importlib.util.spec_from_file_location("reader","qa/radar-original-document-reader.py")
reader=importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
original_extract=reader.extract_text
meta=threading.local()
def bounded_extract(body,mime,url):
    if mime!="application/pdf" and not body.startswith(b"%PDF-"):
        return original_extract(body,mime,url)
    with fitz.open(stream=body,filetype="pdf") as document:
        pages=len(document)
        text=[]
        ocr_done=0
        unread=[]
        for index in range(min(pages,12)):
            value=document[index].get_text()
            if len(value.strip())<40:
                if ocr_done<3:
                    pix=document[index].get_pixmap(matrix=fitz.Matrix(1.6,1.6),alpha=False)
                    value=reader.ocr_bytes(pix.tobytes("png"))
                    ocr_done+=1
                if len(value.strip())<40:
                    unread.append(index+1)
            text.append(value)
        complete=pages<=12 and not unread
        meta.value={"pageCount":pages,"pagesRead":len(text),"unreadPages":unread,"ocrPagesAttempted":ocr_done,"complete":complete}
        return re.sub(r"\s+"," "," ".join(text)),("pdf_ocr_local" if ocr_done else "pdf_text") if complete else "pdf_preview_partial"
reader.extract_text=bounded_extract
items=json.loads(Path("qa-output/radar/ocr-work.json").read_text())["documentWork"]["items"]
started=time.monotonic()
results=[]
def process(item):
    if time.monotonic()-started>400:
        return {**item,"decision":"pending_time_budget"}
    meta.value={}
    result=reader.read_one(item)
    result.update(meta.value)
    # The historical reader's classification is evidence for review, never a production approval.
    result["publication_authorized"]=False
    result["processing_environment"]="GitHub Actions, local Tesseract/PyMuPDF"
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    for result in pool.map(process,items):
        results.append(result)
        print("RADAR_OCR_DOCUMENT "+json.dumps(result,ensure_ascii=False),flush=True)
report={"read_only":True,"paid_provider_calls":0,"platform_writes":0,"items_total":len(items),
        "results":results,"processed_at":dt.datetime.now(dt.timezone.utc).isoformat()}
Path("qa-output/radar/ocr.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))

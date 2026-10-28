export function resumeWork(previous,newlyDiscovered) {
 const completed=new Set([...(previous.candidates||[]),...(previous.documents||[])].map(x=>x.url));
 return [...new Map([...newlyDiscovered,...(previous.pending||[])].filter(x=>!completed.has(x.url)).map(x=>[x.url,x])).values()];
}

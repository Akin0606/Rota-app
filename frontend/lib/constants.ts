export const START_TIMES = [
  "5:00am", "6:00am", "7:00am", "8:00am", "9:00am", "10:00am", "11:00am",
  "12:00pm", "1:00pm", "2:00pm", "3:00pm", "4:00pm", "5:00pm", "6:00pm",
  "7:00pm", "8:00pm", "9:00pm", "10:00pm",
];

export const END_TIMES = [
  "12:00pm", "1:00pm", "2:00pm", "3:00pm", "4:00pm", "5:00pm", "6:00pm",
  "7:00pm", "8:00pm", "9:00pm", "10:00pm", "11:00pm", "close",
];

// Full half-hourly clock for the per-day shift editor, which must express real
// post-midnight closes (e.g. 2:30am) that START_TIMES/END_TIMES can't — and
// which deliberately drops the legacy free-text "close" (the per-day model
// replaces it with a stored real time). 12:00am .. 11:30pm.
export const ALL_TIMES: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    const period = h < 12 ? "am" : "pm";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    out.push(`${h12}:00${period}`, `${h12}:30${period}`);
  }
  return out;
})();

export const STAFF_ROLES = ["Bartender", "Server", "Kitchen", "Host", "Manager"];

export const SHIFT_COLORS = ["#f472b6", "#34d399", "#fb923c", "#38bdf8", "#c084fc", "#facc15"];

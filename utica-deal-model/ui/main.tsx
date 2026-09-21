import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadTypeCurveLibrary, loadPriceDeck } from "../engine/index";
import tcJson from "../data/type_curve_library.json";
import deckJson from "../data/price_file_library.json";

const data = { typeCurves: loadTypeCurveLibrary(tcJson as any), priceDeck: loadPriceDeck(deckJson as any) };
createRoot(document.getElementById("root")!).render(<App data={data} />);

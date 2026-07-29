// Los shims (Buffer global) DEBEN cargarse antes que nada.
import "./src/shims";

import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);

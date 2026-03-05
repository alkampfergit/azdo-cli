import { Command } from "commander";
import { version } from "./version.js";

const program = new Command();

program.name("azdo").description("Azure DevOps CLI tool").version(version);

program.parse();

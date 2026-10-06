# Patient app UI

- `UI-BRIEF.md`: the design brief (tokens, motion, navigation, screen specs, build order).
- `mockups/`: one HTML reference per designed screen, exported from the screen board. They are visual references, not code to port.
- Screen board (live mockups, notes, comments): https://claude.ai/artifact/3jTqjhZzBh6ZGS561w8EyD
- UI roadmap: https://claude.ai/code/artifact/d1d7ab05-71ec-41b7-b4d3-acdaa4d48dce

## Building it with Claude Code in VS Code

Open the repo in VS Code and start Claude Code (the extension, or `claude` in the terminal). `CLAUDE.md` already points it at this brief. Start with phase 0:

```
Read docs/ui/UI-BRIEF.md and docs/ui/mockups/01-inicio.html. Do phase 0: extend packages/ui with the tokens, add the fonts and libraries with npx expo install, build the shared components and the useEntrance hook, and switch the patient app to bottom tabs. Show me the plan before you edit anything.
```

Then build one screen at a time, for example "Build the Inicio screen from 01-inicio.html using the shared components", and compare it on a device against the screen board.

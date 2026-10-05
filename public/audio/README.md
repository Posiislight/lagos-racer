# Game audio files

Drop recordings here and the game uses them instead of the built-in synthesised sounds. Any file that is
missing or fails to load is skipped, so you can add them one at a time. Names and volumes are set in
`src/config/sounds.ts`.

Keep them small: mono, `.ogg`, and the whole folder under about 1 MB (most players are on mobile data).
Short one-shots should be under 2 seconds; loops should join cleanly at the ends.

| File | Plays when | Type |
|---|---|---|
| `ambience-lagos.ogg` | the whole race: traffic pings, angry shouting, generators. 20-40 s is enough | loop |
| `juju-fly.ogg` | a juju is flying at you; gets louder and higher as it closes in | loop |
| `juju-hit.ogg` | a juju lands | one-shot |
| `oil-drop.ogg` | a crude oil slick is dropped | one-shot |
| `oil-slip.ogg` | someone skids on oil | one-shot |
| `fuel-boost.ogg` | the fuel speed boost is used | one-shot |
| `odeshi.ogg` | odeshi charm switches on, or blocks a juju | one-shot |
| `odeshi-break.ogg` | odeshi runs out | one-shot |
| `push-squad.ogg` | Moshood's Push Squad | one-shot |
| `soup.ogg` | Mama Put's Pepper Soup Trail starts | one-shot |
| `soup-bubble.ogg` | while the soup trail is live | loop |

In Audacity: File > Export > Export as OGG, with Tracks > Mix > Mix Stereo Down to Mono first.

I got the request from client to make Figma plugin for them.
Here is approximated description of problem.
The team met the operational problem with process of icon releases.
Currently they have sets of icons. These sets may be used for different projects/pages/systems/etc.
The main issue for them is searching a suitable icon for project and adding it to there.
Designer has to search it manually.
Anyway their sets of icons and icons itself have the metadata properties as: size, style, tags.
To make operationing is more convinient they want optimize process by Figma plugin.
What they want:
For example we create a new set of icons in "Library". @libs.png
We wanna add a category to this set or icon item. For example: Kitchen.
Based on this tag they want to place short version of icon set to separate frame. @icons_by_category.png
This frame contains sets of short version icon sets. By this approach they can see what icons they use for what categories.
What is short version of icon. For example we have 6 icons for one set. They have own size and style. To reduce noise from big amount of different icons we have to have short version of icon. It may looks like a card of icon which contain icon itself (any size), name, tags, etc. metadata added to set of icons. @short_icon_card.png
How it may work:
1. Create the new set of icons.
    - Create new set in "Library"
    - Add all necessary metadata to the created set: size, style, tags, categories
    - Release the new version of icon set.
    - Short version of set appears on a separate frame based on categories

2. Update the existent set of icons.
    - Add/remove/update icon in set
    - Update metadata.
    - Release the updated version of icon set.
    - Short version of set updated on a separate frame based on categories.
        - If remove category - removed from frame as well
        - If add or change category - update on frame accordingly
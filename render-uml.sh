#!/bin/bash
# Script to render UML diagrams of the flows as PNGs
# and adds them to the README.md.
#
# Usage: ./render-uml.sh

shopt -s nullglob

branch=$(git symbolic-ref --short HEAD)
for dir in ./src/flows/*/; do
    files=("$dir"*.uml)
    fullfile="${files[0]}"
    if [ -n "$fullfile" ]; then
        filename=$(basename -- "$fullfile")
        img="${filename%.*}.png"

        # Refer https://plantuml.com/server
        url="http://www.plantuml.com/plantuml/proxy?cache=no&src=https://raw.githubusercontent.com/Cypherock/cysync-module-protocols/${branch}/${fullfile:2}"
        echo "Rendering $fullfile"
        curl -s -o "$dir$img" "$url"

        # Add a README with this image
        echo "![${img}](./${img})" >"${dir}README.md"
    fi
done

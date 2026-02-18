#!/bin/bash
curl -s https://techstacks.io/api/QueryTechnology?fields=name,id -o QueryTechnology.json
jq '[.results[] | {(.name): .id}] | add' QueryTechnology.json > all-technologies.json

jq 'sort_by(ascii_downcase)' blacklist-technologies.json > blacklist-technologies.tmp && mv blacklist-technologies.tmp blacklist-technologies.json


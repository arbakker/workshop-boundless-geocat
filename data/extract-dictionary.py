#!/bin/python
import re
fields = open('census_nl-fields.txt', 'r')
output= open("dictionary.txt", 'w+')
for line in fields:
    count+=1
    match=re.match("^.*: .*$", line, flags=0)
    if match:
        split_dict = line.split()
        exclude = ["GM_CODE","GM_NAAM","WK_CODE","WK_NAAM"]
        if  split_dict[0].upper()[:-1] not in exclude:
            postgres_columns = open('column_names.txt', 'r')
            for pg_line in postgres_columns:
                split_postgres = pg_line.split()
                if split_postgres[0].upper() == split_dict[0].upper()[:-1]:
                    output.write(line)
            postgres_columns.close()
fields.close()
output.close()

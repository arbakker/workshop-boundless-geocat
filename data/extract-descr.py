#!/bin/python
import re

fields = open('census_nl-fields.txt', 'r')
count=0

output= open("dictionary.txt", 'w+')


for line in fields:
    count+=1
    count_pg=0
    match=re.match("^.*: .*$", line, flags=0)
    if match:

        split_dict = line.split()

        postgres_columns = open('column_names.txt', 'r')
        for pg_line in postgres_columns:
            count_pg+=0
            split_postgres = pg_line.split()
            if split_postgres[0].upper() == split_dict[0].upper()[:-1]:
                output.write(line)
        postgres_columns.close()
fields.close()
output.close()

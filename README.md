# eLab-ASR-Addon
This is the git repo for Extracellular's Automatic Sample Reduction (ASR) addon, it's designed to allow users to automatically subtract the quantity of a sample used in an experiment based on a specified table format.

The sectionHeader of the section containing the table with all the used sample quantities are entered via a dialogue box.

### ⚠️ Formatting Warning ⚠️

This addon has only been tested for Extracellular's specific table formats, other formats are not guaranteed to work. Some example table formats that are known to work are shown below. This would be added once in an experiment to indiciate how much of a sample is used based on how much is needed and the volume being prepared, e.g:

Volume of reagent being prepared: 0.2 L

| Item    | Qty needed/L | Unit | Qty needed | Unit | Amount used | Unit |
| :---:   | :---:        | :---:| :---:      | :---:| :---:       | :---:|
| Sample1 | 200       | mL   | 40         | mL   | 200         | mL   |
| Sample2 | 800       | mL   | 160        | mL   | 800         | mL   |
| Sample3 | 10        | mL   | 2          | mL   | 2.1         | mL   |

Another example is shown below, this table can be added multiple times in a single experiment section, the amount used of each sample will be added up:

| Used Sample: | Used Amount: | Unit: |
| :---:        | :---:        | :---: |
| Sample1      | 500          | ml    |
| Sample2      | 20           | ul    |
| Sample3      | 1            | g     |

#### IMPORTANT NOTE - Item is interchangable with Used Sample, same with Amount Used and Used Amount (colon or no colon ':').

---

To get started you must:
1. Install NodeJS with a version >= 16
2. npm install http-server -g (can add sudo on the front)
3. Get OpenSSL, they ask for a specific version but I got a different one (check [here](https://developer.elabnext.com/docs/getting-started))
4. run to generate keys:
```
$ req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 10000 –nodes
```
5. then make start-up script executable:
```
chmod +x SDK-server.sh
```
6. And you can run the server with:
```
./SDK-server.sh
```

NOTE: ALSO MIGHT NEED TO GENERATE OWN GIT PERSONAL ACCESS TOKEN

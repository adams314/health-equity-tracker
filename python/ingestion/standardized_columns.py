from enum import Enum

RACE_OR_HISPANIC_COL = "race_and_ethnicity"
HISPANIC_COL = "hispanic_or_latino"
RACE_COL = "race"
AGE_COL = "age"
SEX_COL = "sex"
STATE_FIPS_COL = "state_fips"
STATE_NAME_COL = "state_name"
COUNTY_FIPS_COL = "county_fips"
COUNTY_NAME_COL = "county_name"
POPULATION_COL = "population"

# Standardized column names for Covid cases, hospitalizations, and deaths.
COVID_CASES = "cases"
COVID_HOSP_Y = "hosp_y"
COVID_HOSP_N = "hosp_n"
COVID_HOSP_UNKNOWN = "hosp_unknown"
COVID_DEATH_Y = "death_y"
COVID_DEATH_N = "death_n"
COVID_DEATH_UNKNOWN = "death_unknown"

# Standard Health Insurance Population Cols
TOTAL_HEALTH_INSURANCE_COL = "total_health_insurance"
WITH_HEALTH_INSURANCE_COL = "with_health_insurance"
WITHOUT_HEALTH_INSURANCE_COL = "without_health_insurance"


# TODO add Asian/Pacific Islander combined, and Indigenous combined
class Race(Enum):
    AIAN = "American Indian and Alaska Native"
    AIAN_NH = "American Indian and Alaska Native (Non-Hispanic)"
    ASIAN = "Asian"
    ASIAN_NH = "Asian (Non-Hispanic)"
    BLACK = "Black or African American"
    BLACK_NH = "Black or African American (Non-Hispanic)"
    ETHNICITY_UNKNOWN = "Unknown ethnicity"
    HISP = "Hispanic or Latino"
    INDIGENOUS = "Indigenous"
    NHPI = "Native Hawaiian and Pacific Islander"
    NHPI_NH = "Native Hawaiian and Pacific Islander (Non-Hispanic)"
    NH = "Not Hispanic or Latino"
    OTHER = "Some other race"
    OTHER_NH = "Some other race (Non-Hispanic)"
    TOTAL = "Total"
    MULTI = "Two or more races"
    MULTI_NH = "Two or more races (Non-Hispanic)"
    WHITE = "White"
    WHITE_NH = "White (Non-Hispanic)"
    UNKNOWN = "Unknown race"
    UNKNOWN_NH = "Unknown race (Non-Hispanic)"
    API = "Asian and Pacific Islander"

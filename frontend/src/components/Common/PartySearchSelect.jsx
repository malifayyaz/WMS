import React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';

/**
 * Searchable dropdown for customers, suppliers, or any party list ({ _id, name, ... }).
 */
export default function PartySearchSelect({
  options = [],
  value,
  onChange,
  label = 'Select',
  required = false,
  disabled = false,
  getOptionLabel,
  renderOption,
  helperText,
  margin = 'dense',
  placeholder = 'Type to search…',
  allowEmpty = false,
  emptyLabel = '— None —',
}) {
  const resolveLabel = getOptionLabel || ((opt) => (opt?.name ? String(opt.name) : ''));
  const allOptions = allowEmpty
    ? [{ _id: '', name: emptyLabel, __empty: true }, ...options]
    : options;
  const selected = allOptions.find((o) => String(o._id) === String(value ?? '')) || null;

  return (
    <Autocomplete
      options={allOptions}
      value={selected}
      onChange={(_, opt) => onChange(opt?._id ?? '')}
      getOptionLabel={(opt) => (opt?.__empty ? emptyLabel : resolveLabel(opt))}
      renderOption={renderOption}
      isOptionEqualToValue={(a, b) => String(a?._id) === String(b?._id)}
      disabled={disabled}
      autoHighlight
      openOnFocus
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          margin={margin}
          helperText={helperText}
          placeholder={placeholder}
        />
      )}
    />
  );
}

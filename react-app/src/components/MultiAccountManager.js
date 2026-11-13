import React from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  IconButton, 
  List, 
  ListItem, 
  ListItemText, 
  Switch, 
  FormControlLabel, 
  Tooltip, 
  Divider,
  Paper,
  Chip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import LayersIcon from '@mui/icons-material/Layers';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useAppContext } from '../contexts/AppContext';
import { sharedStyles } from '../styles';

export default function MultiAccountManager() {
  const { formData, setFormData } = useAppContext();

  // Multi-account settings in formData
  const accounts = formData.multiAccounts || [];
  const multiTabEnabled = formData.multiTabEnabled || false;

  const [newAccountName, setNewAccountName] = React.useState('');
  const [newUsername, setNewUsername] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');

  const handleToggleMultiTab = async (e) => {
    const isChecked = e.target.checked;
    const updatedForm = {
      ...formData,
      multiTabEnabled: isChecked,
    };
    setFormData(updatedForm);
    if (chrome?.storage?.local) {
      await chrome.storage.local.set({ tatkalTicketBookingFormData: updatedForm });
    }
  };

  const handleAddAccount = async () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      alert('Please enter both User ID and Password');
      return;
    }

    const newEntry = {
      id: Date.now().toString(),
      name: newAccountName.trim() || `Account ${(formData.multiAccounts || []).length + 1}`,
      username: newUsername.trim(),
      password: newPassword.trim(),
      enabled: true,
    };

    const updatedAccounts = [...(formData.multiAccounts || []), newEntry];
    const updatedForm = {
      ...formData,
      multiAccounts: updatedAccounts,
      multiTabEnabled: true,
    };

    setFormData(updatedForm);
    // Direct persist to chrome storage so service worker immediately has it
    if (chrome?.storage?.local) {
      await chrome.storage.local.set({ tatkalTicketBookingFormData: updatedForm });
    }

    setNewAccountName('');
    setNewUsername('');
    setNewPassword('');
  };

  const handleDeleteAccount = async (id) => {
    const updatedAccounts = (formData.multiAccounts || []).filter((acc) => acc.id !== id);
    const updatedForm = {
      ...formData,
      multiAccounts: updatedAccounts,
    };
    setFormData(updatedForm);
    if (chrome?.storage?.local) {
      await chrome.storage.local.set({ tatkalTicketBookingFormData: updatedForm });
    }
  };

  const handleToggleAccount = async (id) => {
    const updatedAccounts = (formData.multiAccounts || []).map((acc) =>
      acc.id === id ? { ...acc, enabled: !acc.enabled } : acc
    );
    const updatedForm = {
      ...formData,
      multiAccounts: updatedAccounts,
    };
    setFormData(updatedForm);
    if (chrome?.storage?.local) {
      await chrome.storage.local.set({ tatkalTicketBookingFormData: updatedForm });
    }
  };

  const handleTriggerHitNow = async () => {
    // Force write current state to storage first
    if (chrome?.storage?.local) {
      await new Promise((resolve) => {
        chrome.storage.local.set({ tatkalTicketBookingFormData: formData }, resolve);
      });
    }

    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ 
        action: 'TRIGGER_MULTI_TAB_HIT', 
        multiAccounts: formData.multiAccounts || [],
        multiTabEnabled: formData.multiTabEnabled 
      }, (res) => {
        if (chrome.runtime.lastError) {
          alert('Error: ' + chrome.runtime.lastError.message);
        } else {
          console.log('Multi-tab response:', res);
        }
      });
    } else {
      alert('Extension runtime not available in preview mode.');
    }
  };

  return (
    <Box sx={{ ...sharedStyles.container, mt: 2 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <LayersIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
            Multi-Tab Parallel Hit System
          </Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={multiTabEnabled}
              onChange={handleToggleMultiTab}
              color="primary"
            />
          }
          label={<Typography variant="body2" fontWeight="bold">Enable Multi-Tab Hit</Typography>}
        />
      </Box>

      <Typography variant="body2" color="text.secondary" mb={1.5}>
        Configure multiple IRCTC accounts. Each enabled account opens in its own independent virtual browser window tiled across your screen, executing the exact same journey, train, passenger, and payment automation simultaneously.
      </Typography>

      <Paper elevation={0} sx={{ p: 1.5, backgroundColor: '#fffbeb', borderRadius: 2, mb: 2, border: '1px solid #fef3c7' }}>
        <Typography variant="caption" sx={{ color: '#b45309', fontWeight: 600, display: 'block' }}>
          ⚠️ Session Notice: All extension windows run within the same Chrome browser profile and share cookies. While each window automates independently with its own login credentials, if IRCTC terminates concurrent sessions on the same IP/cookie jar, test with 2 accounts first before running 4–5 accounts simultaneously.
        </Typography>
      </Paper>

      {/* Account Creation Input Row */}
      <Paper elevation={0} sx={{ p: 2, backgroundColor: '#f8fafc', borderRadius: 2, mb: 2, border: '1px solid #e2e8f0' }}>
        <Typography variant="subtitle2" fontWeight="bold" mb={1} color="#334155">
          Add IRCTC Account For Parallel Tab
        </Typography>
        <Box display="flex" flexWrap="wrap" gap={1.5} alignItems="center">
          <TextField
            size="small"
            label="Profile / Tab Name (e.g. Tab 1)"
            value={newAccountName}
            onChange={(e) => setNewAccountName(e.target.value)}
            sx={{ flex: 1, minWidth: '160px', backgroundColor: '#fff' }}
          />
          <TextField
            size="small"
            label="IRCTC User ID"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            required
            sx={{ flex: 1, minWidth: '160px', backgroundColor: '#fff' }}
          />
          <TextField
            size="small"
            type="password"
            label="IRCTC Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            sx={{ flex: 1, minWidth: '160px', backgroundColor: '#fff' }}
          />
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddCircleOutlineIcon />}
            onClick={handleAddAccount}
            sx={{ height: 40, px: 2, textTransform: 'none', fontWeight: 'bold' }}
          >
            Add Tab Account
          </Button>
        </Box>
      </Paper>

      {/* List of Configured Parallel Accounts */}
      {accounts.length > 0 ? (
        <Box mb={2}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="subtitle2" fontWeight="bold" color="#475569">
              Configured Parallel Tabs ({accounts.filter((a) => a.enabled).length}/{accounts.length} active):
            </Typography>
            <Button
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<PlayArrowIcon />}
              onClick={handleTriggerHitNow}
              disabled={!multiTabEnabled || accounts.filter((a) => a.enabled).length === 0}
              sx={{ textTransform: 'none', fontWeight: 'bold' }}
            >
              Test Hit Now (Open Tabs)
            </Button>
          </Box>
          <List dense sx={{ backgroundColor: '#fff', borderRadius: 1.5, border: '1px solid #e2e8f0', p: 0 }}>
            {accounts.map((acc, idx) => (
              <React.Fragment key={acc.id}>
                <ListItem
                  secondaryAction={
                    <Box display="flex" alignItems="center" gap={1}>
                      <Switch
                        size="small"
                        checked={acc.enabled}
                        onChange={() => handleToggleAccount(acc.id)}
                      />
                      <Tooltip title="Delete Account">
                        <IconButton edge="end" color="error" onClick={() => handleDeleteAccount(acc.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2" fontWeight="bold">
                          {acc.name}
                        </Typography>
                        <Chip
                          size="small"
                          label={`User: ${acc.username}`}
                          variant="outlined"
                          sx={{ fontSize: '0.75rem', height: 20 }}
                        />
                        {acc.enabled ? (
                          <Chip size="small" label="Ready to Hit" color="success" sx={{ fontSize: '0.75rem', height: 20 }} />
                        ) : (
                          <Chip size="small" label="Paused" color="default" sx={{ fontSize: '0.75rem', height: 20 }} />
                        )}
                      </Box>
                    }
                    secondary={`Target: Simultaneous booking execution with password ••••••••`}
                  />
                </ListItem>
                {idx < accounts.length - 1 && <Divider component="li" />}
              </React.Fragment>
            ))}
          </List>
        </Box>
      ) : (
        <Typography variant="body2" sx={{ fontStyle: 'italic', color: '#94a3b8', my: 1 }}>
          No parallel tab accounts added yet. Add your additional accounts above to hit IRCTC simultaneously from multiple tabs.
        </Typography>
      )}
    </Box>
  );
}
